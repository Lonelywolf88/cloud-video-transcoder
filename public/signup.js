const API = "/api/v1";

document.getElementById("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Sign up failed");
      return;
    }

    alert("✅ Registered! Check your email for confirmation code.");
    window.location.href = "confirm.html"; // go to confirm page
  } catch (err) {
    alert("Error during signup");
  }
});
