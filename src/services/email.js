
async function sendOtpEmail(to, otp) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  if (!apiKey || !senderEmail) {
    throw new Error('Brevo environment variables are missing');
  }

  if (typeof fetch !== 'function') {
    throw new Error('Node.js 18 or newer is required');
  }

  const response = await fetch(
    'https://api.brevo.com/v3/smtp/email',
    {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: 'CampusRent',
          email: senderEmail
        },
        to: [{ email: to }],
        subject: 'Your CampusRent OTP',
        htmlContent: `
          <div style="font-family:Arial;padding:20px">
            <h2>CampusRent Verification</h2>
            <p>Your verification code is:</p>
            <h1 style="letter-spacing:8px">${otp}</h1>
            <p>This OTP expires in 5 minutes.</p>
            <p>Do not share this code with anyone.</p>
          </div>
        `
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Brevo API error:', response.status, error);
    throw new Error('Email delivery failed');
  }

  const result = await response.json();

  return {
    messageId: result.messageId
  };
}

module.exports = { sendOtpEmail };
module.exports = {
  sendOtpEmail
};