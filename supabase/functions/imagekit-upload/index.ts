// ============================================================
// Choice Properties — ImageKit Upload Edge Function
// Supabase → Functions → imagekit-upload
//
// Required secret in Supabase Dashboard → Edge Functions → Secrets:
//   IMAGEKIT_PRIVATE_KEY  →  your ImageKit private key
//   IMAGEKIT_URL_ENDPOINT →  e.g. https://ik.imagekit.io/yourID
//
// This function:
//   1. Receives a base64-encoded file + metadata from the browser
//   2. Authenticates with ImageKit using the private key (server-side)
//   3. Uploads to ImageKit and returns the final CDN URL
//   4. The private key is NEVER exposed to the browser
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const IMAGEKIT_PRIVATE_KEY  = Deno.env.get('IMAGEKIT_PRIVATE_KEY');
    const IMAGEKIT_URL_ENDPOINT = Deno.env.get('IMAGEKIT_URL_ENDPOINT');

    if (!IMAGEKIT_PRIVATE_KEY || !IMAGEKIT_URL_ENDPOINT) {
      throw new Error('ImageKit secrets not configured. Set IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT in Supabase Edge Function secrets.');
    }

    const { fileBase64, fileName, folder } = await req.json();

    if (!fileBase64 || !fileName) {
      throw new Error('fileBase64 and fileName are required');
    }

    // Basic auth: ImageKit uses privateKey as the username, empty password
    const authHeader = 'Basic ' + btoa(`${IMAGEKIT_PRIVATE_KEY}:`);

    const body = new URLSearchParams();
    body.append('file',     fileBase64);
    body.append('fileName', fileName);
    body.append('folder',   folder || '/properties');
    body.append('useUniqueFileName', 'true');

    const ikRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method:  'POST',
      headers: { 'Authorization': authHeader },
      body,
    });

    const ikData = await ikRes.json();

    if (!ikRes.ok) {
      throw new Error(ikData.message || 'ImageKit upload failed');
    }

    return new Response(
      JSON.stringify({ success: true, url: ikData.url, fileId: ikData.fileId }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
