// Garden Grit quote form: the GHL tracking script captures the fields in the browser; this just lands the visitor on the thank-you page.
module.exports = (req, res) => { res.statusCode = 303; res.setHeader('Location', '/thank-you/'); res.end(); };
