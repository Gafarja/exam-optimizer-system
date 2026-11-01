require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const formatter = require('./formatter');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let activeUserToken = null;
let activeUserProfile = null;

// Use Memory Storage to handle file buffers directly for Supabase Cloud Storage
const upload = multer({ storage: multer.memoryStorage() });

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
            options: { data: { full_name: fullname, user_role: role } }
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

        activeUserToken = data.session.access_token;
        activeUserProfile = data.user;
        const role = data.user.user_metadata.user_role;

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
// 3. EXAM FILE UPLOAD PIPELINE (Supabase Cloud Storage & Success Redirect)
// ==========================================
app.post('/api/upload-exam', upload.single('examFile'), async (req, res) => {
    const { subject, grade, term, session_year, duration, teacherName } = req.body;
    const file = req.file;

    if (!file) return res.status(400).send('Missing uploaded document file target attachment.');

    try {
        const tId = activeUserProfile ? activeUserProfile.id : '00000000-0000-0000-0000-000000000000';
        const tName = activeUserProfile?.user_metadata?.full_name || teacherName || 'The Noble Standard Teacher';

        // Unique file path name in Supabase storage bucket
        const storageFileName = `${Date.now()}-${file.originalname}`;

        // Upload buffer directly to Supabase Storage bucket 'exams'
        const { error: storageError } = await supabase.storage
            .from('exams')
            .upload(storageFileName, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            });

        if (storageError) {
            throw new Error("Supabase Storage Upload Error: " + storageError.message);
        }

        // Save record to Supabase database table 'exams'
        const { error: insertError } = await supabase.from('exams').insert([{
            teacher_id: tId,
            teacher_name: tName,
            subject: subject,
            grade: grade,
            term: term,
            duration: duration,
            session_year: session_year,
            file_path: storageFileName // stores storage file key reference
        }]);

        if (insertError) {
            console.error("❌ Supabase Insert Error:", insertError.message);
        } else {
            console.log("✅ Exam record successfully saved to Supabase database & storage!");
        }

        // Trigger success message popup alert and redirect back to teacher portal dashboard
        res.send(`
            <script>
                alert("Exam paper compiled and submitted successfully!");
                window.location.href = '/teacher.html';
            </script>
        `);

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
// 5. EXAM OFFICER DASHBOARD QUEUE ENDPOINTS
// ==========================================
const fetchAllExams = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('exams')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        console.error("Dashboard fetch error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

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
        const { data: examData, error: fetchError } = await supabase
            .from('exams')
            .select('file_path, teacher_id')
            .eq('id', examId)
            .single();

        if (fetchError || !examData) throw new Error("Submission record not found.");

        const userRole = activeUserProfile?.user_metadata?.user_role;
        if (examData.teacher_id !== activeUserProfile.id && userRole !== 'officer') {
            return res.status(430).json({ success: false, error: "Permission denied." });
        }

        // Remove file from Supabase Storage bucket
        await supabase.storage.from('exams').remove([examData.file_path]);

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
// 7. ADMIN DELETE SUBMISSION ENDPOINT
// ==========================================
app.post('/api/admin/delete-exam', async (req, res) => {
    const { examId } = req.body;
    try {
        const { data: examData, error: fetchError } = await supabase
            .from('exams')
            .select('file_path')
            .eq('id', examId)
            .single();

        if (examData && examData.file_path) {
            await supabase.storage.from('exams').remove([examData.file_path]);
        }

        const { error: deleteError } = await supabase
            .from('exams')
            .delete()
            .eq('id', examId);

        if (deleteError) throw deleteError;

        res.json({ success: true, message: "Exam paper deleted successfully from admin queue." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 8. EXAM OFFICER DOWNLOAD & OPTIMIZE PIPELINE ROUTE
// ==========================================
app.get('/api/download/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { data: exam, error } = await supabase
            .from('exams')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !exam) {
            return res.status(404).send('Exam submission record not found in the database.');
        }

        // Download file blob buffer from Supabase Storage bucket
        const { data: fileBlob, error: downloadError } = await supabase.storage
            .from('exams')
            .download(exam.file_path);

        if (downloadError || !fileBlob) {
            return res.status(404).send('Original Word document file no longer exists in Supabase storage.');
        }

        const arrayBuffer = await fileBlob.arrayBuffer();
        const fileBuffer = Buffer.from(arrayBuffer);

        const rawText = await formatter.extractTextFromDocxBuffer(fileBuffer);
        const auditResults = formatter.optimizeExamText(rawText);
        
        const htmlOutput = formatter.generatePrintTemplate(
            { 
                subject: exam.subject, 
                grade: exam.grade, 
                term: exam.term, 
                session_year: exam.session_year, 
                duration: exam.duration 
            },
            auditResults
        );

        res.send(htmlOutput);

    } catch (err) {
        console.error("Optimization pipeline error:", err);
        res.status(500).send(`Error processing exam document: ${err.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});