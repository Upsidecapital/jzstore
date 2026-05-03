import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder')
  const { recipientEmail, recipientName, reportContent, reportMonth } = await req.json()

  if (!recipientEmail || !reportContent) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Convert markdown to simple HTML
  const htmlContent = reportContent
    .replace(/^## (.+)$/gm, '<h2 style="color:#0f172a;font-size:20px;margin:24px 0 8px">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="color:#1e293b;font-size:16px;margin:16px 0 6px">$1</h3>')
    .replace(/^\*\*(.+)\*\*$/gm, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li style="margin:4px 0">$1</li>')
    .replace(/^([^<\n].+)$/gm, '<p style="margin:8px 0;line-height:1.6">$1</p>')
    .replace(/---/g, '<hr style="border:1px solid #e2e8f0;margin:24px 0">')

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family:Inter,system-ui,sans-serif;max-width:640px;margin:0 auto;padding:40px 24px;color:#0f172a">
      <div style="background:#16a34a;padding:20px 24px;border-radius:12px 12px 0 0">
        <h1 style="color:white;margin:0;font-size:24px">Naik</h1>
        <p style="color:#bbf7d0;margin:4px 0 0;font-size:14px">Monthly Marketing Report — ${reportMonth}</p>
      </div>
      <div style="background:white;padding:32px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
        ${htmlContent}
      </div>
      <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:24px">
        Sent by Naik AI CMO Platform · <a href="${process.env.NEXT_PUBLIC_APP_URL}" style="color:#16a34a">naik.my</a>
      </p>
    </body>
    </html>
  `

  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'reports@naik.my',
      to: recipientEmail,
      subject: `${reportMonth} Marketing Report`,
      html: emailHtml,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
