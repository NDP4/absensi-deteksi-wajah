
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

const dbPath = path.join(__dirname, 'db');
const facesFilePath = path.join(dbPath, 'faces.json');
const attendanceFilePath = path.join(dbPath, 'attendance.json');

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Helper function for robustly reading and parsing JSON files
function readJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return [];
        const fileContent = fs.readFileSync(filePath, 'utf8');
        return fileContent ? JSON.parse(fileContent) : [];
    } catch (error) {
        console.error(`Error reading or parsing ${filePath}:`, error);
        return []; // Return empty array if file is corrupt or unreadable
    }
}

// Ensure db directory and files exist on startup
if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath);
if (!fs.existsSync(facesFilePath)) fs.writeFileSync(facesFilePath, '[]');
if (!fs.existsSync(attendanceFilePath)) fs.writeFileSync(attendanceFilePath, '[]');

// --- Face Registration API ---
app.get('/data', (req, res) => res.sendFile(facesFilePath));
app.post('/register', (req, res) => {
    const { name, descriptor } = req.body;
    const faces = readJsonFile(facesFilePath);
    if (faces.some(face => face.label === name)) {
        return res.status(400).json({ message: 'Name already registered.' });
    }
    faces.push({ label: name, descriptors: [descriptor] });
    fs.writeFileSync(facesFilePath, JSON.stringify(faces, null, 2));
    res.status(201).json({ message: 'Face registered successfully.' });
});

// --- Attendance API ---
const getToday = () => new Date().toISOString().split('T')[0];

app.get('/attendance-records', (req, res) => res.sendFile(attendanceFilePath));

app.get('/attendance-status/:name', (req, res) => {
    const { name } = req.params;
    const attendance = readJsonFile(attendanceFilePath);
    const todayRecord = attendance.find(r => r.name === name && r.date === getToday());
    if (todayRecord) {
        res.json({ hasCheckedIn: true, hasCheckedOut: !!todayRecord.checkOut });
    } else {
        res.json({ hasCheckedIn: false, hasCheckedOut: false });
    }
});

const updateAttendance = (name, type) => {
    const attendance = readJsonFile(attendanceFilePath);
    const today = getToday();
    const now = new Date().toISOString();
    let todayRecord = attendance.find(r => r.name === name && r.date === today);

    if (type === 'checkIn') {
        if (todayRecord) return { success: false, message: 'Already checked in today' };
        attendance.push({ name, date: today, checkIn: now, checkOut: null });
    } else { // checkOut
        if (!todayRecord) return { success: false, message: 'Must check in before checking out' };
        todayRecord.checkOut = now;
    }

    fs.writeFileSync(attendanceFilePath, JSON.stringify(attendance, null, 2));
    return { success: true };
};

app.post('/check-in', (req, res) => {
    const { name } = req.body;
    const result = updateAttendance(name, 'checkIn');
    res.status(result.success ? 201 : 400).json(result);
});

app.post('/check-out', (req, res) => {
    const { name } = req.body;
    const result = updateAttendance(name, 'checkOut');
    res.status(result.success ? 201 : 400).json(result);
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
