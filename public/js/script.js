document.addEventListener("DOMContentLoaded", () => {
  const video = document.getElementById("video");
  const registerButton = document.getElementById("registerButton");
  const attendanceTableBody = document.getElementById("attendance-table-body");
  const livenessPrompt = document.getElementById("liveness-prompt");

  // Modal elements
  const modal = document.getElementById("modal");
  const modalName = document.getElementById("modal-name");
  const modalTime = document.getElementById("modal-time");
  const checkinButton = document.getElementById("checkin-button");
  const checkoutButton = document.getElementById("checkout-button");
  const cancelButton = document.getElementById("cancel-button");

  let labeledFaceDescriptors = null;
  let faceMatcher = null;
  const attendanceLog = new Map();
  let detectedName = null;
  let clockInterval;
  let isLivenessCheckRunning = false;

  // --- Toast Notification Functions ---
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toast-message");
  const toastIcon = document.getElementById("toast-icon");
  const toastClose = document.getElementById("toast-close");
  let toastTimeout;
  toastClose.addEventListener("click", () => hideToast());
  function hideToast() {
    toast.classList.add("translate-x-full");
    clearTimeout(toastTimeout);
  }
  function showToast(message, type = "info") {
    clearTimeout(toastTimeout);
    const icons = {
      success:
        '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>',
      error:
        '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>',
      info: '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>',
    };
    const colors = {
      success: { text: "text-green-500", bg: "bg-green-100" },
      error: { text: "text-red-500", bg: "bg-red-100" },
      info: { text: "text-blue-500", bg: "bg-blue-100" },
    };
    toastIcon.innerHTML = icons[type];
    toastIcon.className = `inline-flex items-center justify-center flex-shrink-0 w-8 h-8 ${colors[type].text} ${colors[type].bg} rounded-lg`;
    toastMessage.textContent = message;
    toast.classList.remove("translate-x-full");
    toastTimeout = setTimeout(() => hideToast(), 5000);
  }

  // --- Modal Functions ---
  function showModal(name, status) {
    detectedName = name;
    modalName.textContent = name;
    checkinButton.classList.toggle("hidden", status.hasCheckedIn);
    checkoutButton.classList.toggle(
      "hidden",
      !status.hasCheckedIn || status.hasCheckedOut
    );
    modal.classList.remove("hidden");
    clockInterval = setInterval(() => {
      modalTime.textContent = new Date().toLocaleTimeString();
    }, 1000);
  }
  function hideModal() {
    modal.classList.add("hidden");
    clearInterval(clockInterval);
    detectedName = null;
  }

  // --- API Call Functions ---
  async function performCheck(action) {
    try {
      const response = await fetch(`/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: detectedName }),
      });
      if (!response.ok) throw new Error((await response.json()).message);
      showToast(
        `Berhasil ${action === "check-in" ? "absen masuk" : "absen keluar"}!`,
        "success"
      );
      fetchAndDisplayRecords();
      // Capture image after successful check-in/check-out
      await captureAndSendImage(
        action === "check-in" ? "checkIn" : "checkOut",
        detectedName,
        video,
        document.getElementById("canvas")
      );
    } catch (err) {
      showToast(err.message, "error");
    }
    hideModal();
  }

  checkinButton.addEventListener("click", () => performCheck("check-in"));
  checkoutButton.addEventListener("click", () => performCheck("check-out"));
  cancelButton.addEventListener("click", hideModal);

  // --- Image Capture Function ---
  async function captureAndSendImage(type, name, videoElement, canvasElement) {
    const context = canvasElement.getContext("2d");
    // Temporarily resize canvas to video dimensions for accurate capture
    const originalWidth = canvasElement.width;
    const originalHeight = canvasElement.height;
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    context.drawImage(
      videoElement,
      0,
      0,
      videoElement.videoWidth,
      videoElement.videoHeight
    );
    const imageData = canvasElement.toDataURL("image/jpeg", 0.9);

    // Restore original canvas dimensions
    canvasElement.width = originalWidth;
    canvasElement.height = originalHeight;

    try {
      const response = await fetch("/save-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData, name, type }),
      });
      if (!response.ok) throw new Error((await response.json()).message);
      console.log(`Image for ${type} saved successfully.`);
    } catch (error) {
      console.error(`Failed to save image for ${type}:`, error);
    }
  }

  // --- Liveness Detection ---
  function getEyeAspectRatio(landmarks) {
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    return (eyeAspectRatio(leftEye) + eyeAspectRatio(rightEye)) / 2.0;
  }

  function eyeAspectRatio(eye) {
    const A = faceapi.euclideanDistance(
      [eye[1].x, eye[1].y],
      [eye[5].x, eye[5].y]
    );
    const B = faceapi.euclideanDistance(
      [eye[2].x, eye[2].y],
      [eye[4].x, eye[4].y]
    );
    const C = faceapi.euclideanDistance(
      [eye[0].x, eye[0].y],
      [eye[3].x, eye[3].y]
    );
    return (A + B) / (2.0 * C);
  }

  function getMouthAspectRatio(landmarks) {
    const mouth = landmarks.getMouth();
    const A = faceapi.euclideanDistance(
      [mouth[13].x, mouth[13].y],
      [mouth[19].x, mouth[19].y]
    );
    const B = faceapi.euclideanDistance(
      [mouth[14].x, mouth[14].y],
      [mouth[18].x, mouth[18].y]
    );
    const C = faceapi.euclideanDistance(
      [mouth[15].x, mouth[15].y],
      [mouth[17].x, mouth[17].y]
    );
    const D = faceapi.euclideanDistance(
      [mouth[12].x, mouth[12].y],
      [mouth[16].x, mouth[16].y]
    );
    return (A + B + C) / (2.0 * D);
  }

  async function doLivenessCheckStep(
    promptText,
    checkFunction,
    threshold,
    consecutiveFrames = 1,
    isNodCheck = false
  ) {
    return new Promise((resolve) => {
      let frameCounter = 0;
      let prevValue = 0;
      let nodDirection = "none";
      let nodSequence = { down: false, up: false };

      const interval = setInterval(async () => {
        const detections = await faceapi
          .detectSingleFace(
            video,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 320 })
          )
          .withFaceLandmarks();
        if (!detections) {
          livenessPrompt.textContent = `Wajah tidak terdeteksi. ${promptText}`;
          return;
        }

        let currentValue;
        if (isNodCheck) {
          currentValue = detections.landmarks.getNose()[3].y;
          livenessPrompt.textContent = `${promptText} (Y: ${currentValue.toFixed(
            2
          )})`;
        } else {
          currentValue = checkFunction(detections.landmarks);
          livenessPrompt.textContent = `${promptText} (${
            promptText.includes("kedip") ? "EAR" : "MAR"
          }: ${currentValue.toFixed(2)})`;
        }

        let success = false;

        if (isNodCheck) {
          if (prevValue !== 0) {
            const delta = currentValue - prevValue;
            if (delta > threshold && nodDirection !== "down") {
              nodDirection = "down";
              nodSequence.down = true;
            } else if (
              delta < -threshold &&
              nodDirection !== "up" &&
              nodSequence.down
            ) {
              nodDirection = "up";
              nodSequence.up = true;
            }
            if (nodSequence.down && nodSequence.up) success = true;
          }
          prevValue = currentValue;
        } else if (promptText.includes("kedip")) {
          // Blink check
          if (currentValue < threshold) {
            frameCounter++;
          } else {
            if (frameCounter >= consecutiveFrames) success = true;
            frameCounter = 0;
          }
        } else {
          // Mouth open check
          if (currentValue > threshold) success = true;
        }

        if (success) {
          clearInterval(interval);
          resolve(true);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(interval);
        resolve(false);
      }, 10000); // 10 second timeout per step
    });
  }

  // Liveness check mode: 'absen' (random 1), 'registrasi' (all)
  async function performLivenessCheck(mode = "absen") {
    let blinkSuccess = false;
    let mouthSuccess = false;
    let nodSuccess = false;

    if (mode === "registrasi") {
      // Registrasi: semua validasi
      while (!blinkSuccess) {
        livenessPrompt.textContent = "Berkedip untuk verifikasi...";
        blinkSuccess = await doLivenessCheckStep(
          "Berkedip untuk verifikasi...",
          getEyeAspectRatio,
          0.28,
          2
        );
        if (!blinkSuccess)
          showToast("Verifikasi kedipan gagal. Coba lagi.", "error");
      }
      while (!mouthSuccess) {
        livenessPrompt.textContent = "Buka mulut untuk verifikasi...";
        mouthSuccess = await doLivenessCheckStep(
          "Buka mulut untuk verifikasi...",
          getMouthAspectRatio,
          0.5
        );
        if (!mouthSuccess)
          showToast("Verifikasi buka mulut gagal. Coba lagi.", "error");
      }
      while (!nodSuccess) {
        livenessPrompt.textContent = "Anggukkan kepala untuk verifikasi...";
        nodSuccess = await doLivenessCheckStep(
          "Anggukkan kepala untuk verifikasi...",
          null,
          10,
          1,
          true
        );
        if (!nodSuccess)
          showToast("Verifikasi anggukan kepala gagal. Coba lagi.", "error");
      }
      return { blink: blinkSuccess, mouthOpen: mouthSuccess, nod: nodSuccess };
    } else {
      // Absen: pilih satu validasi secara random
      const checks = [
        {
          name: "kedip",
          fn: async () => {
            while (!blinkSuccess) {
              livenessPrompt.textContent = "Berkedip untuk verifikasi...";
              blinkSuccess = await doLivenessCheckStep(
                "Berkedip untuk verifikasi...",
                getEyeAspectRatio,
                0.28,
                2
              );
              if (!blinkSuccess)
                showToast("Verifikasi kedipan gagal. Coba lagi.", "error");
            }
            return { blink: blinkSuccess, mouthOpen: false, nod: false };
          },
        },
        {
          name: "mulut",
          fn: async () => {
            while (!mouthSuccess) {
              livenessPrompt.textContent = "Buka mulut untuk verifikasi...";
              mouthSuccess = await doLivenessCheckStep(
                "Buka mulut untuk verifikasi...",
                getMouthAspectRatio,
                0.5
              );
              if (!mouthSuccess)
                showToast("Verifikasi buka mulut gagal. Coba lagi.", "error");
            }
            return { blink: false, mouthOpen: mouthSuccess, nod: false };
          },
        },
        {
          name: "angguk",
          fn: async () => {
            while (!nodSuccess) {
              livenessPrompt.textContent =
                "Anggukkan kepala untuk verifikasi...";
              nodSuccess = await doLivenessCheckStep(
                "Anggukkan kepala untuk verifikasi...",
                null,
                10,
                1,
                true
              );
              if (!nodSuccess)
                showToast(
                  "Verifikasi anggukan kepala gagal. Coba lagi.",
                  "error"
                );
            }
            return { blink: false, mouthOpen: false, nod: nodSuccess };
          },
        },
      ];
      // Pilih random
      const randomIdx = Math.floor(Math.random() * checks.length);
      return await checks[randomIdx].fn();
    }
  }

  // --- Main Application Logic ---
  Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
    faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
    faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
    faceapi.nets.ssdMobilenetv1.loadFromUri("/models"),
  ])
    .then(setupCamera)
    .then(loadRegisteredFaces)
    .then(fetchAndDisplayRecords);

  async function setupCamera() {
    try {
      video.srcObject = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
    } catch (err) {
      showToast("Izin kamera ditolak atau tidak ada kamera.", "error");
    }
  }

  async function loadRegisteredFaces() {
    try {
      const data = await (await fetch("/data")).json();
      if (data.length > 0) {
        labeledFaceDescriptors = data.map(
          (d) =>
            new faceapi.LabeledFaceDescriptors(
              d.label,
              d.descriptors.map((descriptor) => new Float32Array(descriptor))
            )
        );
        faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);
        showToast(`Memuat ${data.length} wajah terdaftar.`, "success");
      }
    } catch (error) {
      showToast("Gagal memuat data wajah.", "error");
    }
  }

  async function fetchAndDisplayRecords() {
    try {
      const records = await (await fetch("/attendance-records")).json();
      attendanceTableBody.innerHTML = "";
      records.sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));
      records.forEach((r) => {
        const tr = document.createElement("tr");
        const formatTime = (iso) =>
          iso ? new Date(iso).toLocaleTimeString("id-ID") : "-";
        tr.innerHTML = `<td class="px-6 py-4 whitespace-nowrap">${
          r.name
        }</td><td class="px-6 py-4 whitespace-nowrap">${new Date(
          r.date
        ).toLocaleDateString(
          "id-ID"
        )}</td><td class="px-6 py-4 whitespace-nowrap">${formatTime(
          r.checkIn
        )}</td><td class="px-6 py-4 whitespace-nowrap">${formatTime(
          r.checkOut
        )}</td>`;
        attendanceTableBody.appendChild(tr);
      });
    } catch (error) {
      showToast("Gagal memuat riwayat absensi.", "error");
    }
  }

  video.addEventListener("play", () => {
    const canvas = document.getElementById("canvas");
    const displaySize = {
      width: video.clientWidth,
      height: video.clientHeight,
    };
    faceapi.matchDimensions(canvas, displaySize);
    setInterval(async () => {
      if (isLivenessCheckRunning) return;
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptors();
      const resizedDetections = faceapi.resizeResults(detections, displaySize);
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
      if (faceMatcher && resizedDetections.length > 0) {
        const results = resizedDetections.map((d) =>
          faceMatcher.findBestMatch(d.descriptor)
        );
        results.forEach((result, i) => {
          const box = resizedDetections[i].detection.box;
          const label = result.toString();
          new faceapi.draw.DrawBox(box, { label, boxColor: "#00e676" }).draw(
            canvas
          );
          if (result.label !== "unknown") handleAttendance(result.label);
        });
      }
    }, 1000);
  });

  async function handleAttendance(name) {
    if (
      modal.classList.contains("hidden") &&
      (!attendanceLog.has(name) || Date.now() - attendanceLog.get(name) > 10000)
    ) {
      isLivenessCheckRunning = true;
      livenessPrompt.classList.remove("hidden");
      const livenessResult = await performLivenessCheck("absen");
      if (
        livenessResult.blink ||
        livenessResult.mouthOpen ||
        livenessResult.nod
      ) {
        attendanceLog.set(name, Date.now());
        try {
          const status = await (
            await fetch(`/attendance-status/${name}`)
          ).json();
          if (!status.hasCheckedOut) showModal(name, status);
        } catch (err) {
          console.error("Failed to get attendance status");
        }
      } else {
        showToast(`Verifikasi gagal. Coba lagi.`, "error");
      }
      livenessPrompt.classList.add("hidden");
      isLivenessCheckRunning = false;
    }
  }

  // Modal input nama
  const modalNama = document.getElementById("modal-nama");
  const inputNama = document.getElementById("input-nama");
  const confirmNama = document.getElementById("confirm-nama");
  const cancelNama = document.getElementById("cancel-nama");

  let namaUntukRegistrasi = "";

  registerButton.addEventListener("click", () => {
    inputNama.value = "";
    modalNama.classList.remove("hidden");
    inputNama.focus();
  });

  cancelNama.addEventListener("click", () => {
    modalNama.classList.add("hidden");
    showToast("Pendaftaran dibatalkan.", "info");
  });

  confirmNama.addEventListener("click", async () => {
    const name = inputNama.value.trim();
    if (!name) {
      showToast("Nama tidak boleh kosong.", "error");
      inputNama.focus();
      return;
    }
    modalNama.classList.add("hidden");
    isLivenessCheckRunning = true;
    livenessPrompt.classList.remove("hidden");
    const livenessResult = await performLivenessCheck("registrasi");
    if (
      livenessResult.blink &&
      livenessResult.mouthOpen &&
      livenessResult.nod
    ) {
      showToast(
        "Verifikasi berhasil! Mendeteksi wajah, jangan bergerak...",
        "success"
      );
      try {
        const detections = await faceapi
          .detectSingleFace(video)
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (!detections || !detections.descriptor)
          return showToast(
            "Wajah tidak terdeteksi dengan baik, coba lagi.",
            "error"
          );
        const descriptor = Array.from(detections.descriptor);
        if (descriptor.includes(null))
          return showToast(
            "Kualitas deteksi wajah rendah, silakan coba lagi.",
            "error"
          );
        const response = await fetch("/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, descriptor }),
        });
        if (!response.ok) throw new Error((await response.json()).message);
        showToast("Wajah berhasil didaftarkan!", "success");
        loadRegisteredFaces();
        // Capture image after successful registration
        await captureAndSendImage(
          "registration",
          name,
          video,
          document.getElementById("canvas")
        );
      } catch (error) {
        showToast(`Gagal: ${error.message}`, "error");
      }
    } else {
      showToast(
        `Verifikasi gagal (kedip: ${
          livenessResult.blink ? "berhasil" : "gagal"
        }, mulut: ${livenessResult.mouthOpen ? "berhasil" : "gagal"}, angguk: ${
          livenessResult.nod ? "berhasil" : "gagal"
        }). Coba lagi.`,
        "error"
      );
    }
    livenessPrompt.classList.add("hidden");
    isLivenessCheckRunning = false;
  });
});
