const GOOGLE_KEY = "AIzaSyC3d0-nbRzCRwjMg3iKL-SlwDZzHTuvoqY"; // Google Maps API key
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzC672jQ_y5V9WFXkArpmleTq2vYceqckid-tmXSU8J-zSaO77IPuiKx73Wjnr37Ueo/exec"; // Apps Script URL
const PRICE_MIN = 7.25; // Minimum price per sq ft
const PRICE_MAX = 9.00; // Maximum price per sq ft

const form = document.getElementById("estimateForm");
const resultDiv = document.getElementById("result");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  resultDiv.innerHTML = `<p>🛰️ Calculating your roof estimate...</p>`;

  const data = Object.fromEntries(new FormData(form));
  let roofSqFt = null;

  try {
    // Geocode the address
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(data.address)}&key=${GOOGLE_KEY}`
    );
    const geoData = await geoRes.json();

    if (!geoData.results?.length) throw new Error("Invalid address.");

    const { lat, lng } = geoData.results[0].geometry.location;

    // Try multiple search radii for buildings
    const radiuses = [50, 150, 300];
    let building = null;

    for (let radius of radiuses) {
      const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json];way(around:${radius},${lat},${lng})[building];out geom;`;
      const overpassRes = await fetch(overpassUrl);
      const overpassData = await overpassRes.json();

      if (overpassData.elements?.length) {
        building = overpassData.elements.sort((a, b) => b.geometry.length - a.geometry.length)[0];
        break;
      }
    }

    if (!building) {
      resultDiv.innerHTML = `
        <p style="color:red;">❌ We couldn’t automatically detect the roof outline for this address.<br>
        Please double-check the address or request a manual inspection.</p>
      `;
      return;
    }

    // Calculate area from polygon geometry
    const coords = building.geometry.map(p => [p.lon, p.lat]);
    const polygon = turf.polygon([[...coords, coords[0]]]);
    const areaSqM = turf.area(polygon);
    roofSqFt = Math.round(areaSqM * 10.7639);

    // Calculate estimate range
    const minEstimate = Math.round(roofSqFt * PRICE_MIN);
    const maxEstimate = Math.round(roofSqFt * PRICE_MAX);

    // Display result
    resultDiv.innerHTML = `
      <div style="text-align:center;">
        <h3>✅ Estimate Complete!</h3>
        <p><b>Address:</b> ${data.address}</p>
        <p><b>Roof Type:</b> ${data.roofType}</p>
        <p><b>Measured Roof Size:</b> ${roofSqFt.toLocaleString()} sq ft</p>
        <p><b>💰 Estimated Cost:</b> <span style="color:#0d47a1;font-weight:bold;">
          $${minEstimate.toLocaleString()} – $${maxEstimate.toLocaleString()}</span></p>
        <br>
        <a href="https://calendly.com/andrew-skadra/inspection-sign-up"
           style="background-color:#0d47a1;color:#fff;padding:14px 30px;text-decoration:none;
           border-radius:6px;font-weight:bold;font-size:16px;display:inline-block;">
           📅 Schedule Your Free Inspection
        </a>
      </div>
    `;

    // Send to Google Sheet / Apps Script
    const payload = {
      Timestamp: new Date().toISOString(),
      FullName: data.fullName,
      Address: data.address,
      Phone: data.phone,
      Email: data.email,
      RoofType: data.roofType,
      Notes: data.notes,
      RoofSqFt: roofSqFt,
      EstimateMin: minEstimate,
      EstimateMax: maxEstimate
    };

    await fetch(SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(payload)
    });

  } catch (err) {
    console.error(err);
    resultDiv.innerHTML = `<p style="color:red;">❌ Error calculating estimate. Please try again.</p>`;
  }
});