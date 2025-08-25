const API = "/api/v1";

document.getElementById("loginBtn").addEventListener("click", async () => {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  try {
  const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) return alert("Login failed");
    const data = await res.json();
  localStorage.setItem("token", data.token);
    window.location.href = "/";
  } catch (err) {
    alert("Error logging in");
  }
});
