const API = "/api/v1";

document.getElementById("confirmForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const code = document.getElementById("code").value.trim();

  try {
    const res = await fetch(`${API}/auth/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, code }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Confirmation failed");
      return;
    }

    alert("🎉 Account confirmed! You can now log in.");
    window.location.href = "login.html";
  } catch (err) {
    alert("Error during confirmation");
  }
});
