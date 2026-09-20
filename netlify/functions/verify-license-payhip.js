// Verifies a Payhip license key server-side, so the app itself never has
// to expose the product secret key to the browser (which anyone could
// otherwise read and use to bypass the device cap).
//
// The app calls THIS function with { license_key: "..." }; this function
// calls Payhip on its behalf, then decides pass/fail based on Payhip's
// answer plus the extra rule below (max devices per key).

const PRODUCT_SECRET_KEY = 'prod_sk_dSWng_65656b6ccb7407adacdd7a1388872403aaa09488';
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
    // Step 1: check the key exists, is enabled, and how many times it's
    // already been used.
    const verifyRes = await fetch(
      `https://payhip.com/api/v2/license/verify?license_key=${encodeURIComponent(licenseKey)}`,
      {
        method: 'GET',
        headers: { 'product-secret-key': PRODUCT_SECRET_KEY }
      }
    );

    // Payhip returns an empty body when the key isn't recognised at all.
    const verifyText = await verifyRes.text();
    let verifyData;
    try {
      verifyData = verifyText ? JSON.parse(verifyText) : null;
    } catch (err) {
      verifyData = null;
    }

    if (!verifyData || !verifyData.data) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, message: 'That license key was not recognised.' })
      };
    }

    const info = verifyData.data;

    if (!info.enabled) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, message: 'This license is no longer active. If you believe this is a mistake, please get in touch.' })
      };
    }

    if (typeof info.uses === 'number' && info.uses >= MAX_USES) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, message: `This license has already been activated on the maximum number of devices (${MAX_USES}).` })
      };
    }

    // Step 2: this device is allowed through — record the extra use.
    const usageRes = await fetch('https://payhip.com/api/v2/license/usage', {
      method: 'PUT',
      headers: {
        'product-secret-key': PRODUCT_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `license_key=${encodeURIComponent(licenseKey)}`
    });

    const usageText = await usageRes.text();
    let usageData;
    try {
      usageData = usageText ? JSON.parse(usageText) : null;
    } catch (err) {
      usageData = null;
    }

    if (!usageData || !usageData.data) {
      // Verification passed but we couldn't record the usage — still let
      // them through rather than punishing a genuine buyer for our own
      // bookkeeping hiccup.
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'License verified.' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'License verified.' })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: false, message: 'Could not reach the license server. Check your connection and try again.' })
    };
  }
};
