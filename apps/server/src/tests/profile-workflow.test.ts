/**
 * Profile Workflow Integration Tests
 *
 * Covers:
 *  - Profile Education CRUD (Add, Update, Delete)
 *  - Positional atomic updates validation
 *  - Missing item error handling
 *  - Concurrency checks for atomic subdocument updates
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { Profile } from '../models/Profile.model.js';
import { User } from '../models/User.model.js';
import * as profileService from '../services/profile.service.js';

process.env.NODE_ENV = 'test';
// Use the same test database as search-engine tests to avoid connection conflicts
if (process.env.MONGODB_URI) {
  process.env.MONGODB_URI = process.env.MONGODB_URI.replace(/\/job_tailor.*$/, '/job_tailor_test');
} else {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/job_tailor_test';
}

let testUserId: string;

beforeAll(async () => {
  await connectDatabase();
  console.log('📡 MongoDB connected (profile-workflow tests)');

  const user = await User.create({
    email: 'test-profile@example.com',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345',
    firstName: 'Test',
    lastName: 'Profile',
  });
  testUserId = (user._id as mongoose.Types.ObjectId).toString();
});

afterAll(async () => {
  await Profile.deleteMany({ userId: testUserId });
  await User.deleteMany({ _id: testUserId });
  await disconnectDatabase();
  console.log('📤 MongoDB disconnected (profile-workflow tests)');
});

afterEach(async () => {
  await Profile.deleteMany({ userId: testUserId });
});

describe('Profile Education CRUD & Concurrency Tests', () => {
  it('should successfully perform full Education CRUD operations', async () => {
    // 1. Get or Create Profile
    const profile = await profileService.getOrCreateProfile(testUserId);
    expect(profile.education).toHaveLength(0);

    // 2. Add Education
    const updatedProfileAdd = await profileService.addEducation(testUserId, {
      institution: 'Stanford University',
      degree: 'M.S.',
      field: 'Computer Science',
      startYear: 2021,
      endYear: 2023,
      gpa: '3.9/4.0',
    });

    expect(updatedProfileAdd.education).toHaveLength(1);
    const addedEdu = updatedProfileAdd.education[0];
    expect(addedEdu.institution).toBe('Stanford University');
    expect(addedEdu.degree).toBe('M.S.');
    expect(addedEdu.field).toBe('Computer Science');
    expect(addedEdu.startYear).toBe(2021);
    expect(addedEdu.endYear).toBe(2023);
    expect(addedEdu.gpa).toBe('3.9/4.0');
    expect(addedEdu._id).toBeDefined();

    const eduId = addedEdu._id!.toString();

    // 3. Update Education (Partial Update check)
    const updatedProfileEdit = await profileService.updateEducation(testUserId, eduId, {
      degree: 'Ph.D.',
      gpa: undefined, // undefined should be filtered out and NOT clear the existing gpa value
    });

    expect(updatedProfileEdit).not.toBeNull();
    const editedEdu = updatedProfileEdit!.education.find(e => e._id!.toString() === eduId);
    expect(editedEdu).toBeDefined();
    expect(editedEdu!.degree).toBe('Ph.D.');
    expect(editedEdu!.institution).toBe('Stanford University'); // Unmodified field remains
    expect(editedEdu!.gpa).toBe('3.9/4.0'); // Omitted undefined property preserved

    // 4. Delete Education
    const updatedProfileDel = await profileService.deleteEducation(testUserId, eduId);
    expect(updatedProfileDel.education).toHaveLength(0);
  });

  it('should return null or throw 404 when updating non-existent education item', async () => {
    await profileService.getOrCreateProfile(testUserId);
    const nonExistentId = new mongoose.Types.ObjectId().toString();

    const result = await profileService.updateEducation(testUserId, nonExistentId, {
      institution: 'MIT',
    });
    expect(result).toBeNull();
  });

  it('should successfully perform full Certification CRUD operations', async () => {
    // 1. Get or Create Profile
    const profile = await profileService.getOrCreateProfile(testUserId);
    expect(profile.certifications).toHaveLength(0);

    // 2. Add Certification
    const updatedProfileAdd = await profileService.addCertification(testUserId, {
      name: 'AWS Solutions Architect',
      issuer: 'Amazon Web Services',
      date: '2023-08',
      credentialUrl: 'https://credly.com/aws-sa',
    });

    expect(updatedProfileAdd.certifications).toHaveLength(1);
    const addedCert = updatedProfileAdd.certifications[0];
    expect(addedCert.name).toBe('AWS Solutions Architect');
    expect(addedCert.issuer).toBe('Amazon Web Services');
    expect(addedCert.date).toBe('2023-08');
    expect(addedCert.credentialUrl).toBe('https://credly.com/aws-sa');
    expect(addedCert._id).toBeDefined();

    const certId = addedCert._id!.toString();

    // 3. Update Certification
    const updatedProfileEdit = await profileService.updateCertification(testUserId, certId, {
      name: 'AWS Solutions Architect - Professional',
      credentialUrl: undefined, // undefined should be filtered out
    });

    expect(updatedProfileEdit).not.toBeNull();
    const editedCert = updatedProfileEdit!.certifications.find(c => c._id!.toString() === certId);
    expect(editedCert).toBeDefined();
    expect(editedCert!.name).toBe('AWS Solutions Architect - Professional');
    expect(editedCert!.issuer).toBe('Amazon Web Services');
    expect(editedCert!.credentialUrl).toBe('https://credly.com/aws-sa'); // Preserved

    // 4. Delete Certification
    const updatedProfileDel = await profileService.deleteCertification(testUserId, certId);
    expect(updatedProfileDel.certifications).toHaveLength(0);
  });

  it('should return null or throw 404 when updating non-existent certification item', async () => {
    await profileService.getOrCreateProfile(testUserId);
    const nonExistentId = new mongoose.Types.ObjectId().toString();

    const result = await profileService.updateCertification(testUserId, nonExistentId, {
      name: 'GCP Architect',
    });
    expect(result).toBeNull();
  });

  it('should throw validation error when adding education with invalid startYear', async () => {
    await profileService.getOrCreateProfile(testUserId);
    await expect(
      profileService.addEducation(testUserId, {
        institution: 'Stanford',
        degree: 'M.S.',
        field: 'CS',
        startYear: 1950, // min is 1980 in Profile schema definition
      })
    ).rejects.toThrow();
  });

  it('should throw validation error when adding project with invalid tag category', async () => {
    await profileService.getOrCreateProfile(testUserId);
    await expect(
      profileService.addProject(testUserId, {
        name: 'Bad Project',
        description: 'Testing validation',
        techStack: ['Node'],
        tags: ['invalid-tag-category' as any], // not in the enum
        startDate: '2023-01',
      })
    ).rejects.toThrow();
  });

  it('should support concurrent subdocument writes without VersionError or array overwrites', async () => {
    await profileService.getOrCreateProfile(testUserId);

    // Run parallel additions to different array subdocuments
    await Promise.all([
      profileService.addSkill(testUserId, {
        name: 'Node.js',
        category: 'backend',
        yearsOfExperience: 5,
        proficiency: 'expert',
        isHighlighted: true,
      }),
      profileService.addEducation(testUserId, {
        institution: 'Berkeley',
        degree: 'B.S.',
        field: 'EECS',
        startYear: 2017,
        endYear: 2021,
      }),
      profileService.addProject(testUserId, {
        name: 'Compiler Design',
        description: 'A custom parser and generator built in Rust',
        techStack: ['Rust'],
        tags: ['backend'],
        startDate: '2020-01',
        highlights: ['Supports full AST tree building'],
      }),
    ]);

    // Retrieve fresh profile from database
    const freshProfile = await Profile.findOne({ userId: testUserId }).lean().exec();
    expect(freshProfile).not.toBeNull();
    expect(freshProfile!.skills).toHaveLength(1);
    expect(freshProfile!.education).toHaveLength(1);
    expect(freshProfile!.projects).toHaveLength(1);

    expect(freshProfile!.skills[0].name).toBe('Node.js');
    expect(freshProfile!.education[0].institution).toBe('Berkeley');
    expect(freshProfile!.projects[0].name).toBe('Compiler Design');
  });
});
