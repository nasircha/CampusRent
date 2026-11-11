
async function sendOtpEmail(to, otp) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is missing');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'CampusRent <onboarding@resend.dev>',
      to: [to],
      subject: 'Your CampusRent OTP',
      html: `
        <div style="font-family:Arial;padding:20px">
          <h2>CampusRent Verification</h2>
          <p>Your verification code is:</p>
          <h1 style="letter-spacing:8px">${otp}</h1>
          <p>This OTP expires in 5 minutes.</p>
          <p>Do not share this code with anyone.</p>
        </div>
      `
    })
  });

  const result = await response.json();

  if (!response.ok) {
    console.error('Resend API error:', response.status, result);
    throw new Error('Email delivery failed');
  }

  return { messageId: result.id };
}

module.exports = { sendOtpEmail };
