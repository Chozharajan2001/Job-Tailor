import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: "user" | "admin";
  isActive: boolean;
  lastLoginAt?: Date;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  emailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  loginAttempts: number;
  lockUntil?: Date;
  lastFailedLogin?: Date;
  activeSessions: Array<{
    sessionId: string;
    refreshTokenHash: string;
    userAgent: string;
    ip: string;
    fingerprintHash?: string;
    createdAt: Date;
    lastUsedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: [true, "Password is required"],
      minlength: [60, "Password hash must be a valid bcrypt hash"],
      select: false, // Never include in queries by default
    },
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: 50,
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: 50,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },
    resetPasswordToken: {
      type: String,
    },
    resetPasswordExpires: {
      type: Date,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
    },
    emailVerificationExpires: {
      type: Date,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
    lastFailedLogin: {
      type: Date,
    },
    activeSessions: [
      {
        sessionId: { type: String, required: true },
        refreshTokenHash: { type: String, required: true },
        userAgent: { type: String, required: true },
        ip: { type: String, required: true },
        fingerprintHash: { type: String },
        createdAt: { type: Date, default: Date.now },
        lastUsedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Sparse indexes for single-query lookups of hashed verification/reset tokens
userSchema.index({ emailVerificationToken: 1 }, { sparse: true });
userSchema.index({ resetPasswordToken: 1 }, { sparse: true });

export const User = mongoose.model<IUser>("User", userSchema);
