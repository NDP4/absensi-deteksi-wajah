
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

const dbPath = path.join(__dirname, 'db');
const facesFilePath = path.join(dbPath, 'faces.json');
const attendanceFilePath = path.join(dbPath, 'attendance.json');

// Directory for captured images
const capturedImagesDir = path.join(__dirname, 'captured_images');
const registrationImagesDir = path.join(capturedImagesDir, 'registrasi', 'wajah');
const attendanceMasukImagesDir = path.join(capturedImagesDir, 'absen', 'masuk');
const attendanceKeluarImagesDir = path.join(capturedImagesDir, 'absen', 'keluar');

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

// Helper function to ensure directory exists recursively
function ensureDirectoryExistence(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Directory created: ${dirPath}`);
    }
}

// Ensure db directory and files exist on startup
if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath);
if (!fs.existsSync(facesFilePath)) fs.writeFileSync(facesFilePath, '[]');
if (!fs.existsSync(attendanceFilePath)) fs.writeFileSync(attendanceFilePath, '[]');

// Ensure captured_images directories exist on startup
ensureDirectoryExistence(registrationImagesDir);
ensureDirectoryExistence(attendanceMasukImagesDir);
ensureDirectoryExistence(attendanceKeluarImagesDir);

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

// --- Image Saving API ---
app.post('/save-image', (req, res) => {
    const { imageData, name, type } = req.body;
    const base64Data = imageData.replace(/^data:image\/jpeg;base64,/, '');
    const date = new Date().toISOString().split('T')[0];
    let filePath;

    switch (type) {
        case 'registration':
            filePath = path.join(registrationImagesDir, `${name}-${date}.jpg`);
            break;
        case 'checkIn':
            filePath = path.join(attendanceMasukImagesDir, `${name}-${date}.jpg`);
            break;
        case 'checkOut':
            filePath = path.join(attendanceKeluarImagesDir, `${name}-${date}.jpg`);
            break;
        default:
            console.error('Invalid image type received:', type);
            return res.status(400).json({ message: 'Invalid image type.' });
    }

    // Ensure directory exists before writing file
    ensureDirectoryExistence(path.dirname(filePath));

    fs.writeFile(filePath, base64Data, 'base64', (err) => {
        if (err) {
            console.error('Error saving image:', err);
            return res.status(500).json({ message: 'Failed to save image.' });
        }
        console.log(`Image saved successfully: ${filePath}`);
        res.status(200).json({ message: 'Image saved successfully.' });
    });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
