require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const Formatter = require('./Formatter');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase Connection Client (Using your original SUPABASE_KEY variable)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Middleware Settings
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Global state variables tracking the active user account context safely
let activeUserToken = null;
let activeUserProfile = null;

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer storage engine disk parameters
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Gateway Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// 1. SIGN UP ENDPOINT
// ==========================================
app.post('/api/signup', async (req, res) => {
    const { fullname, email, password, role } = req.body;
    try {
        const { error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: fullname,
                    user_role: role
                }
            }
        });
        if (error) throw error;
        res.send(`
            <div style="text-align:center; font-family:Arial; margin-top:50px;">
                <h2 style="color:green;">Registration Completed Successfully!</h2>
                <p>You can now go back and log into your workspace dashboard panel.</p>
                <a href="/auth.html" style="color:#2563eb; font-weight:bold; text-decoration:none;">Go to Sign In</a>
            </div>
        `);
    } catch (err) {
        res.status(400).send(`<p style="color:red; font-family:Arial;">Registration Error: ${err.message}</p>`);
    }
});

// ==========================================
// 2. LOGIN ENDPOINT
// ==========================================
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Cache the session data variables safely
        activeUserToken = data.session.access_token;
        activeUserProfile = data.user;
        const role = data.user.user_metadata.user_role;

        // Secure conditional role redirection routing paths
        if (role === 'teacher') {
            res.redirect('/teacher.html');
        } else if (role === 'officer') {
            res.redirect('/admin.html');
        } else {
            res.send(`<h2>Unknown account role context structure detected.</h2>`);
        }
    } catch (err) {
        res.status(400).send(`<p style="color:red; font-family:Arial;">Login Error: ${err.message}</p>`);
    }
});

// ==========================================
// 3. EXAM FILE PROCESSING PIPELINE ENDPOINT (Robust Session Fallback)
// ==========================================
app.post('/api/upload-exam', upload.single('examFile'), async (req, res) => {
    const { subject, grade, term, session_year, duration, teacherName } = req.body;
    const file = req.file;

    if (!file) return res.status(400).send('Missing uploaded document file target attachment.');

    try {
        // Determine the teacher's ID and Name securely from active profile or request fallback
        const tId = activeUserProfile ? activeUserProfile.id : '00000000-0000-0000-0000-000000000000';
        const tName = activeUserProfile?.user_metadata?.full_name || teacherName || 'The Noble Standard Teacher';

        // Save record directly to Supabase table 'exams' every single time
        const { error: insertError } = await supabase.from('exams').insert([{
            teacher_id: tId,
            teacher_name: tName,
            subject: subject,
            grade: grade,
            term: term,
            duration: duration,
            session_year: session_year,
            file_path: file.path
        }]);

        if (insertError) {
            console.error("❌ Supabase Insert Error:", insertError.message);
        } else {
            console.log("✅ Exam record successfully saved to Supabase database!");
        }

        // 1. Extract raw structural text characters out from the Word document
        const rawText = await Formatter.extractTextFromDocx(file.path);
        
        // 2. Process text strings through the smart auditor engine
        const auditResults = Formatter.optimizeExamText(rawText);
        
        // 3. Construct HTML print view template passing curriculum parameters
        const htmlOutput = Formatter.generatePrintTemplate(
            { subject, grade, term, session_year, duration },
            auditResults
        );

        // Serve output directly to the client browser view screen context
        res.send(htmlOutput);

    } catch (err) {
        console.error(err);
        res.status(500).send(`Processing Pipeline Error: ${err.message}`);
    }
});

// ==========================================
// 4. TEACHER WORKSPACE HISTORY TRACKING LOG
// ==========================================
app.get('/api/teacher-history', async (req, res) => {
    if (!activeUserProfile) return res.json([]);
    try {
        const { data, error } = await supabase
            .from('exams')
            .select('*')
            .eq('teacher_id', activeUserProfile.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 5. EXAM OFFICER DASHBOARD QUEUE ENDPOINTS (Multi-alias & Direct Array Format)
// ==========================================
const fetchAllExams = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('exams')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        // Return the raw array directly so admin.html loops through it successfully
        res.json(data || []);
    } catch (err) {
        console.error("Dashboard fetch error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Cover all possible route names your frontend might be fetching
app.get('/api/submissions', fetchAllExams);
app.get('/api/exams', fetchAllExams);
app.get('/api/admin/exams', fetchAllExams);
app.get('/api/admin-logs', fetchAllExams);

// ==========================================
// 6. TEACHER DELETE SUBMISSION ENDPOINT
// ==========================================
app.post('/api/delete-exam', async (req, res) => {
    const { examId } = req.body;

    if (!activeUserProfile) {
        return res.status(401).json({ success: false, error: "Unauthorized access profile." });
    }

    try {
        // Authenticate this specific server action context with Supabase RLS
        await supabase.auth.setSession({
            access_token: activeUserToken,
            refresh_token: activeUserToken
        });

        // 1. Get the file path from the database before deleting the row
        const { data: examData, error: fetchError } = await supabase
            .from('exams')
            .select('file_path, teacher_id')
            .eq('id', examId)
            .single();

        if (fetchError || !examData) throw new Error("Submission record not found.");

        // Security check: Ensure the logged-in teacher owns this specific file
        if (examData.teacher_id !== activeUserProfile.id) {
            return res.status(430).json({ success: false, error: "Permission denied." });
        }

        // 2. Delete the file physically from your laptop's 'uploads/' folder
        if (fs.existsSync(examData.file_path)) {
            fs.unlinkSync(examData.file_path);
        }

        // 3. Remove the record from the Supabase cloud table row queue
        const { error: deleteError } = await supabase
            .from('exams')
            .delete()
            .eq('id', examId);

        if (deleteError) throw deleteError;

        res.json({ success: true, message: "Submission deleted cleanly." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 7. EXAM OFFICER DOWNLOAD & OPTIMIZE PIPELINE ROUTE
// ==========================================
app.get('/api/download/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // 1. Fetch exam record from Supabase by ID
        const { data: exam, error } = await supabase
            .from('exams')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !exam) {
            return res.status(404).send('Exam submission record not found in the database.');
        }

        // 2. Check if the document file physically exists on the server storage
        if (!fs.existsSync(exam.file_path)) {
            return res.status(404).send('Original Word document file no longer exists on the server storage folder.');
        }

        // 3. Extract text from the Word document and run it through your Formatter engine
        const rawText = await Formatter.extractTextFromDocx(exam.file_path);
        const auditResults = Formatter.optimizeExamText(rawText);
        
        // 4. Generate the professional 2-Column Newspaper Layout print template
        const htmlOutput = Formatter.generatePrintTemplate(
            { 
                subject: exam.subject, 
                grade: exam.grade, 
                term: exam.term, 
                session_year: exam.session_year, 
                duration: exam.duration 
            },
            auditResults
        );

        // 5. Send the compiled layout directly to the browser for instant viewing and printing
        res.send(htmlOutput);

    } catch (err) {
        console.error("Optimization pipeline error:", err);
        res.status(500).send(`Error processing exam document: ${err.message}`);
    }
});

// Start Server Listen Execution Engine
app.listen(PORT, () => {
    console.log(`🚀 System Pipeline Active at: http://localhost:${PORT}`);
});