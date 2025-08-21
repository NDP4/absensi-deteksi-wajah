
document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('video');
    const registerButton = document.getElementById('registerButton');
    const attendanceTableBody = document.getElementById('attendance-table-body');

    // Modal elements
    const modal = document.getElementById('modal');
    const modalName = document.getElementById('modal-name');
    const modalTime = document.getElementById('modal-time');
    const checkinButton = document.getElementById('checkin-button');
    const checkoutButton = document.getElementById('checkout-button');
    const cancelButton = document.getElementById('cancel-button');

    let labeledFaceDescriptors = null;
    let faceMatcher = null;
    const attendanceLog = new Map();
    let detectedName = null;
    let clockInterval;

    // --- Toast Notification Functions (from previous step) ---
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');
    const toastClose = document.getElementById('toast-close');
    let toastTimeout;
    toastClose.addEventListener('click', () => hideToast());
    function hideToast() { toast.classList.add('translate-x-full'); clearTimeout(toastTimeout); }
    function showToast(message, type = 'info') {
        clearTimeout(toastTimeout);
        const icons = { success: '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>', error: '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>', info: '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>' };
        const colors = { success: { text: 'text-green-500', bg: 'bg-green-100' }, error: { text: 'text-red-500', bg: 'bg-red-100' }, info: { text: 'text-blue-500', bg: 'bg-blue-100' } };
        toastIcon.innerHTML = icons[type]; toastIcon.className = `inline-flex items-center justify-center flex-shrink-0 w-8 h-8 ${colors[type].text} ${colors[type].bg} rounded-lg`; toastMessage.textContent = message;
        toast.classList.remove('translate-x-full');
        toastTimeout = setTimeout(() => hideToast(), 5000);
    }

    // --- Modal Functions ---
    function showModal(name, status) {
        detectedName = name;
        modalName.textContent = name;
        checkinButton.classList.toggle('hidden', status.hasCheckedIn);
        checkoutButton.classList.toggle('hidden', !status.hasCheckedIn || status.hasCheckedOut);
        modal.classList.remove('hidden');
        clockInterval = setInterval(() => { modalTime.textContent = new Date().toLocaleTimeString(); }, 1000);
    }
    function hideModal() { modal.classList.add('hidden'); clearInterval(clockInterval); detectedName = null; }

    // --- API Call Functions ---
    async function performCheck(action) {
        try {
            const response = await fetch(`/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: detectedName }) });
            if (!response.ok) throw new Error((await response.json()).message);
            showToast(`Berhasil ${action === 'check-in' ? 'absen masuk' : 'absen keluar'}!`, 'success');
            fetchAndDisplayRecords();
        } catch (err) { showToast(err.message, 'error'); }
        hideModal();
    }

    checkinButton.addEventListener('click', () => performCheck('check-in'));
    checkoutButton.addEventListener('click', () => performCheck('check-out'));
    cancelButton.addEventListener('click', hideModal);

    // --- Main Application Logic ---
    Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        faceapi.nets.ssdMobilenetv1.loadFromUri('/models')
    ]).then(setupCamera).then(loadRegisteredFaces).then(fetchAndDisplayRecords);

    async function setupCamera() {
        try {
            video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        } catch (err) { showToast('Izin kamera ditolak atau tidak ada kamera.', 'error'); }
    }

    async function loadRegisteredFaces() {
        try {
            const data = await (await fetch('/data')).json();
            if (data.length > 0) {
                labeledFaceDescriptors = data.map(d => 
                    new faceapi.LabeledFaceDescriptors(
                        d.label,
                        d.descriptors.map(descriptor => new Float32Array(descriptor))
                    )
                );
                faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);
                showToast(`Memuat ${data.length} wajah terdaftar.`, 'success');
            }
        } catch (error) { showToast('Gagal memuat data wajah.', 'error'); }
    }

    async function fetchAndDisplayRecords() {
        try {
            const records = await (await fetch('/attendance-records')).json();
            attendanceTableBody.innerHTML = '';
            records.sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));
            records.forEach(r => {
                const tr = document.createElement('tr');
                const formatTime = (iso) => iso ? new Date(iso).toLocaleTimeString('id-ID') : '-';
                tr.innerHTML = `<td class="px-6 py-4 whitespace-nowrap">${r.name}</td><td class="px-6 py-4 whitespace-nowrap">${new Date(r.date).toLocaleDateString('id-ID')}</td><td class="px-6 py-4 whitespace-nowrap">${formatTime(r.checkIn)}</td><td class="px-6 py-4 whitespace-nowrap">${formatTime(r.checkOut)}</td>`;
                attendanceTableBody.appendChild(tr);
            });
        } catch (error) { showToast('Gagal memuat riwayat absensi.', 'error'); }
    }

    video.addEventListener('play', () => {
        const canvas = document.getElementById('canvas');
        const displaySize = { width: video.clientWidth, height: video.clientHeight };
        faceapi.matchDimensions(canvas, displaySize);

        setInterval(async () => {
            const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptors();
            const resizedDetections = faceapi.resizeResults(detections, displaySize);
            canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

            if (faceMatcher && resizedDetections.length > 0) {
                const results = resizedDetections.map(d => faceMatcher.findBestMatch(d.descriptor));
                results.forEach((result, i) => {
                    const box = resizedDetections[i].detection.box;
                    const label = result.toString();
                    new faceapi.draw.DrawBox(box, { label, boxColor: '#00e676' }).draw(canvas);
                    if (result.label !== 'unknown') handleAttendance(result.label);
                });
            }
        }, 1000);
    });

    async function handleAttendance(name) {
        if (modal.classList.contains('hidden') && (!attendanceLog.has(name) || Date.now() - attendanceLog.get(name) > 10000)) {
            attendanceLog.set(name, Date.now());
            try {
                const status = await (await fetch(`/attendance-status/${name}`)).json();
                if (!status.hasCheckedOut) {
                    showModal(name, status);
                }
            } catch (err) { console.error('Failed to get attendance status'); }
        }
    }

    registerButton.addEventListener('click', async () => {
        const name = prompt('Masukkan nama Anda:');
        if (!name) return showToast('Pendaftaran dibatalkan.', 'info');
        showToast('Mendeteksi wajah, jangan bergerak... ', 'info');
        try {
            const detections = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
            if (!detections || !detections.descriptor) return showToast('Wajah tidak terdeteksi dengan baik, coba lagi.', 'error');
            const descriptor = Array.from(detections.descriptor);
            // Final validation: ensure no invalid values (NaN, Infinity) were stringified to null
            if (descriptor.includes(null)) return showToast('Kualitas deteksi wajah rendah, silakan coba lagi.', 'error');

            const response = await fetch('/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, descriptor }) });
            if (!response.ok) throw new Error((await response.json()).message);
            showToast('Wajah berhasil didaftarkan!', 'success');
            loadRegisteredFaces();
        } catch (error) { showToast(`Gagal: ${error.message}`, 'error'); }
    });
});
