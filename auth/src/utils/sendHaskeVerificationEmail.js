export async function sendHaskeVerificationEmail(user) {
  if (!user) {
    throw new Error("Please sign in first.");
  }

  const token = await user.getIdToken(true);

  const response = await fetch(
    "https://api.haske.online/api/auth/send-verification-email",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      cache: "no-store"
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message || "Unable to send verification email."
    );
  }

  return data;
}
