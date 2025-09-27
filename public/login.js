const API = "/api/v1";

document.getElementById("loginBtn").addEventListener("click", async () => {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  try {F
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) return alert("Login failed");
    const data = await res.json();

    // 🟢 Case 1: User must first SETUP MFA
    if (data.setupRequired) {
      alert("MFA setup required. Scan the QR code and enter OTP.");

      // Step 1: Get QR code secret from backend
      const resSetup = await fetch(`${API}/auth/setup-mfa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: data.session }),
      });

      if (!resSetup.ok) return alert("Failed to start MFA setup");
      const setupData = await resSetup.json();

      // Clear login button so user can’t press again
      document.getElementById("loginBtn").style.display = "none";

      // Create QR UI block once
      const container = document.querySelector(".w-full.max-w-md");
      let qrDiv = document.getElementById("mfaSetupBlock");
      if (!qrDiv) {
        qrDiv = document.createElement("div");
        qrDiv.id = "mfaSetupBlock";
        qrDiv.className = "mt-4";
        qrDiv.innerHTML = `
          <p class="text-sm text-slate-300 mb-2">
            Scan this QR code with your Authenticator app:
          </p>
          <div class="flex justify-center mb-3">
            <canvas id="qrCanvas"></canvas>
          </div>
          <input id="setupOtp" placeholder="Enter code from app"
            class="w-full mb-3 px-4 py-3 rounded-lg bg-slate-900/60 border border-white/10 focus:ring-2 focus:ring-emerald-400" />
          <button id="setupBtn"
            class="w-full py-3 rounded-lg bg-purple-500 hover:bg-purple-400 text-slate-900 font-semibold transition-colors">
            Verify Setup
          </button>
        `;
        container.appendChild(qrDiv);
      }

      // 🔹 Generate QR into <canvas> using qrcode.js
      const otpauth = `otpauth://totp/VideoTranscoder:${encodeURIComponent(
        username
      )}?secret=${setupData.secretCode}&issuer=VideoTranscoder`;

      const qrCanvas = document.getElementById("qrCanvas");
      QRCode.toCanvas(qrCanvas, otpauth, { width: 200 }, (err) => {
        if (err) console.error("QR code generation failed:", err);
      });

      // Step 2: Verify the OTP user enters
      document.getElementById("setupBtn").onclick = async () => {
        const code = document.getElementById("setupOtp").value.trim();
        if (!code) return alert("Enter MFA code");

        const resVerify = await fetch(`${API}/auth/verify-setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session: setupData.session, code }),
        });

        if (!resVerify.ok) return alert("MFA setup verification failed");
        alert("✅ MFA setup complete. Please login again.");
        window.location.reload();
      };

      return; // stop here until setup is done
    }

    // 🟢 Case 2: MFA required (user already enrolled)
    if (data.mfaRequired) {
      // Hide login button
      document.getElementById("loginBtn").style.display = "none";

      const container = document.querySelector(".w-full.max-w-md");

      // Avoid duplicates — create MFA block once
      let mfaBlock = document.getElementById("mfaVerifyBlock");
      if (!mfaBlock) {
        mfaBlock = document.createElement("div");
        mfaBlock.id = "mfaVerifyBlock";
        mfaBlock.className = "mt-4";
        mfaBlock.innerHTML = `
          <input id="otpCode" placeholder="Enter MFA code"
            class="w-full mb-3 px-4 py-3 rounded-lg bg-slate-900/60 border border-white/10 focus:ring-2 focus:ring-emerald-400" />
          <button id="verifyBtn"
            class="w-full py-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-slate-900 font-semibold transition-colors">
            Verify MFA
          </button>
        `;
        container.appendChild(mfaBlock);
      }

      // Add handler once
      document.getElementById("verifyBtn").onclick = async () => {
        const code = document.getElementById("otpCode").value.trim();
        if (!code) return alert("Enter MFA code");

        const res2 = await fetch(`${API}/auth/verify-mfa`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, code, session: data.session }),
        });

        if (!res2.ok) return alert("MFA verification failed");
        const data2 = await res2.json();

        localStorage.setItem("token", data2.token);
        window.location.href = "/";
      };

      return;
    }

    // 🟢 Case 3: Normal login (no MFA required)
    localStorage.setItem("token", data.token);
    window.location.href = "/";
  } catch (err) {
    console.error("Login error:", err);
    alert("Error logging in");
  }
});
