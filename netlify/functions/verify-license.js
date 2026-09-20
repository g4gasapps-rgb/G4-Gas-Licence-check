// Verifies a Gumroad license key server-side, so the app itself never has
// to call Gumroad directly from the browser (avoiding any CORS issues).
//
// The app calls THIS function with { license_key: "..." }, and this function
// calls Gumroad on its behalf, then decides pass/fail based on Gumroad's
// answer plus the extra rules below (refund/chargeback check, use-count cap).

const PRODUCT_ID = 'bMcPCH1XFTZSYpkmSc1UYg==';
const MAX_USES = 3; // how many devices a single license can be activated on

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Browsers send a preflight OPTIONS request before the real POST — answer
  // it so the real request is allowed through.
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed.' })
    };
  }

  let licenseKey;
  try {
    const body = JSON.parse(event.body || '{}');
    licenseKey = (body.license_key || '').trim();
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Invalid request.' })
    };
  }

  if (!licenseKey) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Enter a license key.' })
    };
  }

  try {
    const params = new URLSearchParams();
    params.append('product_id', PRODUCT_ID);
    params.append('license_key', licenseKey);
    params.append('increment_uses_count', 'true');

    const gumroadRes = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const data = await gumroadRes.json();

    if (!data.success) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, message: 'That license key was not recognised.' })
      };
    }

    const purchase = data.purchase || {};
    if (purchase.refunded || purchase.chargebacked || purchase.disputed) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, message: 'This purchase is no longer valid.' })
      };
    }

    if (typeof data.uses === 'number' && data.uses > MAX_USES) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          message: `This license has already been activated on the maximum number of devices (${MAX_USES}). Contact support if you've replaced a device.`
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, uses: data.uses })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Could not reach the license server. Check your connection and try again.'
      })
    };
  }
};
