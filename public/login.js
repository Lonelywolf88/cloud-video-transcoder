const API = "/api/v1";

document.getElementById("loginBtn").addEventListener("click", async () => {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) return alert("Login failed");
    const data = await res.json();

    // 🟢 Case 1: User must first SETUP MFA
    if (data.setupRequired) {
      // (unchanged MFA setup block)
      alert("MFA setup required. Scan the QR code and enter OTP.");
      // ... existing MFA setup code ...
      return;
    }

    // 🟢 Case 2: MFA required (user already enrolled)
    if (data.mfaRequired) {
      // Hide login button
      document.getElementById("loginBtn").style.display = "none";

      const container = document.querySelector(".w-full.max-w-md");

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
        if (data2.refreshToken) localStorage.setItem("refreshToken", data2.refreshToken);
        if (data2.expiresIn) localStorage.setItem("expiresAt", Date.now() + data2.expiresIn * 1000);

        window.location.href = "/";
      };

      return;
    }

    // 🟢 Case 3: Normal login (no MFA required)
    localStorage.setItem("token", data.token);
    if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
    if (data.expiresIn) localStorage.setItem("expiresAt", Date.now() + data.expiresIn * 1000);

    window.location.href = "/";
  } catch (err) {
    console.error("Login error:", err);
    alert("Error logging in");
  }
});
