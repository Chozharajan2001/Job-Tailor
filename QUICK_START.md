# 🚀 JobTailor - Quick Start Guide

## Environment Setup Complete ✅

Your environment files have been created and are ready to configure!

---

## 📋 Step-by-Step Configuration

### **1. MongoDB Atlas Setup** (Required)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. Create a free account (no credit card required)
3. Create a new cluster (M0 Free tier)
4. Create a database user:
   - Click "Database Access" → "Add New Database User"
   - Username: `jobtailor_user` (or your choice)
   - Password: Generate a strong password
5. Whitelist your IP:
   - Click "Network Access" → "Add IP Address" → "Allow Access from Anywhere" (for development)
6. Get your connection string:
   - Click "Clusters" → "Connect" → "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your actual password

**Update in `apps/server/.env`:**
```env
MONGODB_URI=mongodb+srv://jobtailor_user:YOUR_ACTUAL_PASSWORD@cluster0.xxxxx.mongodb.net/jobtailor?retryWrites=true&w=majority
```

---

### **2. OpenAI API Key** (Required for AI Features)

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up/login with your account
3. Navigate to "API Keys" section
4. Click "Create new secret key"
5. Copy the key (starts with `sk-`)

**Update in `apps/server/.env`:**
```env
OPENAI_API_KEY=sk-your-actual-openai-api-key-here
```

**Note:** OpenAI offers $5 free credit for new accounts. JD parsing uses GPT-4o-mini (~$0.001 per request).

---

### **3. JWT Secrets** (Already Generated ✅)

Secure JWT secrets have been automatically generated for you. These are safe for development but should be regenerated for production.

**Current values in `apps/server/.env`:**
```env
JWT_SECRET=***REMOVED-JWT-SECRET***
JWT_REFRESH_SECRET=***REMOVED-JWT-REFRESH-SECRET***
```

✅ **No action needed** - these are ready to use!

---

### **4. Cloudinary (Optional for MVP)**

For production, you'll want cloud storage for PDFs. For local development, leave these empty to use local file storage.

**To enable Cloudinary:**
1. Sign up at [Cloudinary](https://cloudinary.com/) (free tier available)
2. Get your credentials from Dashboard
3. Update in `apps/server/.env`:
```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

**For MVP testing:** Leave these fields empty ✅

---

### **5. Client Configuration** (Already Configured ✅)

The client environment file is pre-configured for local development:

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

✅ **No changes needed** for local development!

---

## 🎯 Start Development Server

Once you've configured MongoDB and OpenAI API key:

```bash
# Install dependencies (if not already done)
npm install

# Start both frontend and backend with hot reload
npm run dev
```

**Expected Output:**
```
✓ Server running on http://localhost:5000
✓ Connected to MongoDB
✓ Frontend ready on http://localhost:5173
```

**Open your browser:** http://localhost:5173

---

## 🧪 Test the Application

### **Test Workflow #1: Create Job & Generate Resume**
1. Register/Login to the app
2. Go to "Jobs" page
3. Click "Add Job"
4. Fill in:
   - Job Title: "Senior React Developer"
   - Company: "Tech Corp"
   - Paste a real job description in JD field
5. Click "Parse JD" button
6. Go to "Resume Tailor" page
7. Select the job you just created
8. Click "Generate Tailored Resume"
9. Wait for AI to generate (10-15 seconds)
10. Click green "PDF" button to download
11. Click "Quick Apply" to create application

### **Test Workflow #2: Upload Existing Resume**
1. Go to "Jobs" page
2. Click "Upload Resume" button
3. Drag & drop a PDF resume or click to browse
4. Upload completes successfully
5. Resume appears in your profile

### **Test Workflow #3: Track Applications**
1. Go to "Tracker" page
2. See your applications in Kanban board
3. Click three-dot menu on any card
4. Change status (Applied → Screening → Interview)
5. Add notes and follow-up reminders

---

## 🔧 Troubleshooting

### **Error: "MONGODB_URI is required"**
- Make sure `apps/server/.env` file exists
- Verify MONGODB_URI is not commented out
- Check MongoDB Atlas cluster is active

### **Error: "OPENAI_API_KEY is invalid"**
- Verify your OpenAI API key is correct (starts with `sk-`)
- Check you have available credits in OpenAI dashboard
- Ensure no extra spaces in the key

### **Error: "Port 5000 already in use"**
- Kill existing process: `netstat -ano | findstr :5000` then `taskkill /PID <PID> /F`
- Or change PORT in `.env` to another value (e.g., 5001)

### **Frontend can't connect to backend**
- Verify backend is running on port 5000
- Check CORS_ORIGIN in `.env` matches your frontend URL
- Ensure VITE_API_BASE_URL is correct in client .env

### **Build fails with TypeScript errors**
- Run `npm run build` to check for compilation errors
- Clear cache: `rm -rf node_modules apps/*/node_modules && npm install`

---

## 📁 File Structure Reference

```
JOB TAILOR/
├── apps/
│   ├── server/
│   │   ├── .env                    ← Your server config (DO NOT COMMIT)
│   │   └── .env.example            ← Template (safe to commit)
│   └── client/
│       ├── .env.client             ← Your client config (DO NOT COMMIT)
│       └── .env.example            ← Template (safe to commit)
├── .gitignore                      ← Excludes all .env files
└── ...
```

**Security Note:** `.env` files are gitignored to prevent leaking secrets!

---

## 🌐 Production Deployment

When ready to deploy:

### **Frontend (Vercel)**
```bash
cd apps/client
vercel --prod
```
Set environment variable in Vercel dashboard:
- `VITE_API_BASE_URL=https://your-backend-url.onrender.com/api/v1`

### **Backend (Render/Railway)**
Set environment variables in platform dashboard:
- All variables from `apps/server/.env`
- Set `NODE_ENV=production`
- Generate new JWT secrets for production

### **Database (MongoDB Atlas)**
- Already cloud-based, no migration needed
- Whitelist Render/Railway IP addresses

---

## 📞 Need Help?

- Check [`docs/architecture.md`](docs/architecture.md) for system design
- Review [`docs/api-reference.md`](docs/api-reference.md) for API endpoints
- See [`MVP_STATUS.md`](MVP_STATUS.md) for feature completeness

---

## ✅ Checklist Before First Run

- [ ] MongoDB Atlas cluster created and connection string added to `.env`
- [ ] OpenAI API key obtained and added to `.env`
- [ ] JWT secrets generated (already done ✅)
- [ ] Dependencies installed (`npm install`)
- [ ] Ready to start: `npm run dev`

**You're all set! Happy coding! 🎉**
