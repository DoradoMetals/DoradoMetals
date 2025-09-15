import puppeteer from "puppeteer";
import {
  calculateTotalPrice,
  calculateItemPrice,
  getBullionTotal,
  getScrapTotal,
} from "../utils/price-calculations.js";

import { formatPhoneNumber } from "../utils/formatPhoneNumber.js";
import { assignScrapItemNames } from "../utils/assignScrapNames.js";

export function getScrapPrice(content, spot) {
  if (!spot || !content) return 0;
  return content * (spot.bid_spot * spot.scrap_percentage);
}

export function getProductBidPrice(product, spot) {
  if (!spot || !product) return 0;
  return product.content * (spot.bid_spot * product.bid_premium);
}

export function generateBoxSVG(length, width, height, label) {
  const isFedExBox = label.startsWith("FedEx");

  const scale = 10;

  const w = width * scale;
  const h = height * scale;
  const l = length * scale;

  const skewFactor = 0.5;
  const dx = l * skewFactor;
  const dy = l * skewFactor * 0.5;

  const x = 100;
  const y = 100;

  const A = [x, y];
  const B = [x + w, y];
  const C = [B[0] + dx, B[1] - dy];
  const D = [A[0] + dx, A[1] - dy];

  const E = [x, y - h];
  const F = [x + w, y - h];
  const G = [F[0] + dx, F[1] - dy];
  const H = [E[0] + dx, E[1] - dy];

  const seamStart = [(E[0] + F[0]) / 2, (E[1] + F[1]) / 2];
  const seamEnd = [(H[0] + G[0]) / 2, (H[1] + G[1]) / 2];

  const pts = (arr) => arr.map(([x, y]) => `${x},${y}`).join(" ");

  const allX = [A, B, C, D, E, F, G, H].map((p) => p[0]);
  const allY = [A, B, C, D, E, F, G, H].map((p) => p[1]);

  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);

  const padding = 30;
  const viewBoxX = minX - padding;
  const viewBoxY = minY - padding;
  const viewBoxWidth = maxX - minX + padding * 2;
  const viewBoxHeight = maxY - minY + padding * 2;

  // Vectors along box surface
  const vWidth = [F[0] - E[0], F[1] - E[1]];
  const vDepth = [H[0] - E[0], H[1] - E[1]];

  // Label size (in pixels, adjust as needed)
  const labelWidth = 20; // previously 20
  const labelHeight = 24; // slight increase if you want

  // Normalize vectors (unit length for consistent sizing)
  const magWidth = Math.hypot(vWidth[0], vWidth[1]);
  const magDepth = Math.hypot(vDepth[0], vDepth[1]);
  const unitWidth = [vWidth[0] / magWidth, vWidth[1] / magWidth];
  const unitDepth = [vDepth[0] / magDepth, vDepth[1] / magDepth];

  // Base label corner (offset from E)
  const offsetX = 6;
  const offsetY = 6;

  const L1 = [
    E[0] + offsetX * unitWidth[0] + offsetY * unitDepth[0],
    E[1] + offsetX * unitWidth[1] + offsetY * unitDepth[1],
  ];
  const L2 = [
    L1[0] + labelWidth * unitWidth[0],
    L1[1] + labelWidth * unitWidth[1],
  ];
  const L3 = [
    L2[0] + labelHeight * unitDepth[0],
    L2[1] + labelHeight * unitDepth[1],
  ];
  const L4 = [
    L1[0] + labelHeight * unitDepth[0],
    L1[1] + labelHeight * unitDepth[1],
  ];

  const scribbleLines = [];
  const lineCount = 5;
  const spacing = labelHeight / (lineCount + 1);

  for (let i = 0; i < lineCount; i++) {
    const offset = spacing * (i + 1);

    const lineLen = (labelWidth - 6) * (0.5 + Math.random() * 0.5);

    // Centering offset
    const margin = (labelWidth - lineLen) / 2;

    const x1 = L1[0] + offset * unitDepth[0] + margin * unitWidth[0];
    const y1 = L1[1] + offset * unitDepth[1] + margin * unitWidth[1];
    const x2 = x1 + lineLen * unitWidth[0];
    const y2 = y1 + lineLen * unitWidth[1];

    scribbleLines.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="black" stroke-width="0.4" />`
    );
  }

  if (isFedExBox) {
    return ` 
  <svg 
  width="${viewBoxWidth}" 
  height="${viewBoxHeight}" 
  viewBox="${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}" 
  xmlns="http://www.w3.org/2000/svg"
  style="font-family: Arial, sans-serif; font-size: 10px;">
  
<defs>
<linearGradient id="fedexTop" x1="0%" y1="0%" x2="100%" y2="100%">
  <stop offset="0%" stop-color="#ffffff" />
  <stop offset="100%" stop-color="#f3f3f3" />
</linearGradient>
<linearGradient id="fedexSide" x1="0%" y1="0%" x2="100%" y2="0%">
  <stop offset="0%" stop-color="#f5f5f5" />
  <stop offset="100%" stop-color="#e0e0e0" />
</linearGradient>
<linearGradient id="fedexFront" x1="0%" y1="0%" x2="0%" y2="100%">
  <stop offset="0%" stop-color="#ececec" />
  <stop offset="100%" stop-color="#d9d9d9" />
</linearGradient>
</defs>

<polygon points="${pts([E, F, G, H])}" fill="url(#fedexTop)" stroke="#5e4322"/>
<polygon points="${pts([F, B, C, G])}" fill="url(#fedexSide)" stroke="#5e4322"/>
<polygon points="${pts([
      A,
      B,
      F,
      E,
    ])}" fill="url(#fedexFront)" stroke="#5e4322"/>

<line x1="${seamStart[0]}" y1="${seamStart[1]}" x2="${seamEnd[0]}" y2="${
      seamEnd[1]
    }"
  stroke="#7a5a3a" stroke-width="1" stroke-dasharray="4,2"/>

  <!-- Width label -->
  <text x="${(A[0] + B[0]) / 2}" y="${A[1] + 16}" text-anchor="middle">
    ${width} in
  </text>

  <!-- Length label -->
  <text x="${(B[0] + C[0]) / 2 + 10}" y="${
      (B[1] + C[1]) / 2 + 12
    }" text-anchor="middle">
    ${length} in
  </text>

  <!-- Height label -->
  <text x="${A[0] - 6}" y="${(A[1] + E[1]) / 2 + 4}" text-anchor="end">
    ${height} in
  </text>

<g>
  <polygon
    points="${pts([
      [E[0] + (F[0] - E[0]) * 0.4, E[1] + (F[1] - E[1]) * 0.25],
      [F[0] - (F[0] - E[0]) * 0.4, F[1] + (F[1] - E[1]) * 0.25],
      [G[0] - (G[0] - H[0]) * 0.4, G[1] - (G[1] - H[1]) * 0.25],
      [H[0] + (G[0] - H[0]) * 0.4, H[1] - (G[1] - H[1]) * 0.25],
    ])}"
  fill="#dddddd"
  opacity="0.5"
  />
<polygon
  points="${pts([L1, L2, L3, L4])}"
  fill="white"
  stroke="#444"
  stroke-width="0.4"
/>
${scribbleLines.join("\n")}

<image 
  href="data:image/png;base64,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" 
  x="${B[0] - 50}" 
  y="${E[1] + 2}" 
  width="45" 
  height="12" 
  preserveAspectRatio="xMidYMid meet"
/>
</g>
</svg>
`;
  } else {
    return `
<svg 
  width="${viewBoxWidth}" 
  height="${viewBoxHeight}" 
  viewBox="${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}" 
  xmlns="http://www.w3.org/2000/svg"
  style="font-family: Arial, sans-serif; font-size: 10px;">
  
<defs>
  <linearGradient id="cardboardTop" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#e0c29c" />
    <stop offset="100%" stop-color="#cfa77b" />
  </linearGradient>
  <linearGradient id="cardboardSide" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="#d1a87d" />
    <stop offset="100%" stop-color="#a7794f" />
  </linearGradient>
  <linearGradient id="cardboardFront" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="#c29364" />
    <stop offset="100%" stop-color="#a9733b" />
  </linearGradient>
</defs>

<polygon points="${pts([
      E,
      F,
      G,
      H,
    ])}" fill="url(#cardboardTop)" stroke="#5e4322"/>
<polygon points="${pts([
      F,
      B,
      C,
      G,
    ])}" fill="url(#cardboardSide)" stroke="#5e4322"/>
<polygon points="${pts([
      A,
      B,
      F,
      E,
    ])}" fill="url(#cardboardFront)" stroke="#5e4322"/>

<line x1="${seamStart[0]}" y1="${seamStart[1]}" x2="${seamEnd[0]}" y2="${
      seamEnd[1]
    }"
  stroke="#7a5a3a" stroke-width="1" stroke-dasharray="4,2"/>

  <!-- Width label -->
  <text x="${(A[0] + B[0]) / 2}" y="${A[1] + 16}" text-anchor="middle">
    ${width} in
  </text>

  <!-- Length label -->
  <text x="${(B[0] + C[0]) / 2 + 10}" y="${
      (B[1] + C[1]) / 2 + 12
    }" text-anchor="middle">
    ${length} in
  </text>

  <!-- Height label -->
  <text x="${A[0] - 6}" y="${(A[1] + E[1]) / 2 + 4}" text-anchor="end">
    ${height} in
  </text>

  <g>
    <polygon
      points="${pts([
        [E[0] + (F[0] - E[0]) * 0.4, E[1] + (F[1] - E[1]) * 0.25],
        [F[0] - (F[0] - E[0]) * 0.4, F[1] + (F[1] - E[1]) * 0.25],
        [G[0] - (G[0] - H[0]) * 0.4, G[1] - (G[1] - H[1]) * 0.25],
        [H[0] + (G[0] - H[0]) * 0.4, H[1] - (G[1] - H[1]) * 0.25],
      ])}"
    fill="#f5e4a3"
    opacity="0.7"
  />
    <polygon
      points="${pts([L1, L2, L3, L4])}"
      fill="white"
      stroke="#444"
      stroke-width="0.4"
    />
    ${scribbleLines.join("\n")}
    </g>
    </svg>
  `;
  }
}

export async function generatePackingList({
  purchaseOrder,
  spotPrices = [],
  packageDetails,
}) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();

  const payoutFee = purchaseOrder.payout.cost;

  const total =
    purchaseOrder.order_items.reduce((acc, item) => {
      if (item.item_type === "product") {
        const product = item.product;
        const spot = spotPrices.find((s) => s.type === product?.metal_type);

        const price = item.price ?? getProductBidPrice(product, spot);
        const quantity = item.quantity ?? 1;

        return acc + price * quantity;
      }

      if (item.item_type === "scrap") {
        const scrap = item.scrap;
        const spot = spotPrices.find((s) => s.type === scrap?.metal);

        const price = item.price ?? getScrapPrice(scrap.content, spot);

        return acc + price;
      }

      return acc;
    }, 0) -
    (purchaseOrder.shipment?.shipping_charge ?? 0) -
    payoutFee;

  const rawScrapItems = purchaseOrder.order_items.filter(
    (item) => item.item_type === "scrap" && item.scrap
  );
  const scrapItemsWithNames = assignScrapItemNames(rawScrapItems);
  const scrapItems = scrapItemsWithNames
    .map((item) => {
      const scrap = item.scrap || {};
      const spot = spotPrices.find((s) => s.type === scrap.metal);
      const price =
        item.price != null ? item.price : getScrapPrice(scrap.content, spot);

      return `
        <tr>
          <td>${scrap.name || "Scrap Item"}</td>
          <td>${scrap.pre_melt || "-"} ${scrap.gross_unit || ""}</td>
          <td>${
            scrap.purity != null ? (scrap.purity * 100).toFixed(1) + "%" : "-"
          }</td>
          <td>${scrap.content.toFixed(3)}</td>
          <td>
            ${
              price
                ? price.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })
                : "-"
            }
          </td>
        </tr>
      `;
    })
    .join("");

  const bullionItems = purchaseOrder.order_items
    .filter((item) => item.item_type === "product" && item.product)
    .map((item) => {
      const product = item.product || {};
      const spot = spotPrices.find((s) => s.type === product.metal_type);
      const unitPrice =
        item.price != null ? item.price : getProductBidPrice(product, spot);
      const totalPrice = unitPrice * item.quantity;

      return `
        <tr>
          <td>${product.product_name || "Bullion Product"}</td>
          <td>${product.metal_type || "-"}</td>
          <td>${item.quantity}</td>
          <td>${product.content || "-"}</td>
          <td>
            ${
              totalPrice
                ? totalPrice.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })
                : "-"
            }
          </td>
        </tr>
      `;
    })
    .join("");

  const selectedPackage = packageDetails?.label || "Unknown Package";
  const dimensions = packageDetails?.dimensions || {
    length: "-",
    width: "-",
    height: "-",
    units: "IN",
  };

  const isCarrierPickup =
    purchaseOrder.shipment?.pickup_type !== "Store Dropoff" &&
    purchaseOrder.carrier_pickup !== null;

  const svgBox = generateBoxSVG(
    dimensions.length,
    dimensions.width,
    dimensions.height,
    selectedPackage
  );

  const pickupInstruction = isCarrierPickup
    ? `
      <h3>3) Wait for pickup.</h3>
      <p>
        We've scheduled a FedEx pickup on your behalf. Please ensure your package is ready by
        <strong>${new Date(
          purchaseOrder.carrier_pickup?.pickup_requested_at
        ).toLocaleString("en-US", {
          dateStyle: "long",
          timeStyle: "short",
        })}</strong>.
        You do not need to drop off the package yourself. We’ll update you via email and your dashboard
        once it’s picked up and scanned by the carrier.
      </p>
      `
    : `
      <h3>3) Drop off your package.</h3>
      <p>
        Take your package to a FedEx or affiliate location of your choosing.
        If you would like to change to a carrier pickup, please give us a call and we’ll get you scheduled.
      </p>
    `;

  const htmlContent = `
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              background: white;
            }
            .page {
              background: white;
              position: relative;
            }
            .header {
              display: flex;
              flex-direction: column;
              padding-bottom: 10px;
              margin-bottom: 20px;
            }
            .header-content {
              display: flex;
              align-items: center;
            }
            .logo {
              display: flex;
              flex-direction: column;
              align-items: flex-start;
            }
            .company-name {
              font-size: 20px;
              font-weight: bold;
              margin-bottom: 4px;
            }
            .contact-info {
              display: flex;
              justify-content: space-between;
              width: 100%;
              font-size: 10px;
              color: #666;
            }
            .packing-title {
              font-size: 20px;
              font-weight: bold;
              margin-top: 10px;
              margin-bottom: 5px;
            }
            .packing-subtitle {
              font-size: 12px;
              margin-bottom: 20px;
            }
            .shipping-info {
              display: flex;
              justify-content: space-between;
              gap: 5px;
              margin-bottom: 20px;
            }
            .shipping-box {
              border-left-width: 1px;
              border-left-style: solid;
              border-image: linear-gradient(to bottom, #ae8625, #f5d67d, #d2ac47, #edc967, #ae8625) 1;
              border-radius: 0;
              width: 30%;
              font-size: 12px;
              margin: 0;
            }
            .shipping-box h3 {
              background: linear-gradient(to left, #ae8625 0%, #f5d67d 25%, #d2ac47 50%, #edc967 75%, #ae8625 100%);
              margin: 0;
              padding: 5px;
              font-size: 12px;
            }
            .shipping-box h4 {
              font-size: 14px;
              margin: 0 0 12px 0; /* Top margin 0, bottom margin 4px */
              font-weight: bold;
            }

            .shipping-box p {
              font-size: 12px;
              margin: 0; /* No default margin on paragraphs */
              margin-top: 8px;
              line-height: 1.4;
            }
            .shipping-box div {
              padding: 10px;
            }
            .details {
              display: flex;
              flex-direction: column;
              width: 40%;
              padding: 0;
              border-left-width: 1px;
              border-left-style: solid;
              border-image: linear-gradient(to bottom, #ae8625, #f5d67d, #d2ac47, #edc967, #ae8625) 1;
              font-size: 12px;
            }

            .details h3 {
              background: linear-gradient(to left, #ae8625 0%, #f5d67d 25%, #d2ac47 50%, #edc967 75%, #ae8625 100%);
              margin: 0;
              padding: 5px;
              font-size: 12px;
              text-align: left;
            }

            .detail-content {
              display: flex;
              flex-direction: column;
              gap: 6px;
              padding: 10px;
            }

            .detail-row {
              display: flex;
              justify-content: space-between;
            }
            .detail-label {
              font-weight: normal;
              white-space: nowrap;
            }
            .detail-value {
              font-weight: bold;
            }
            .order-info, .table-container {
              margin-bottom: 20px;
            }
            .section-header {
              background: linear-gradient(to left, #ae8625 0%, #f5d67d 25%, #d2ac47 50%, #edc967 75%, #ae8625 100%);
              padding: 8px;
              font-weight: bold;
              font-size: 14px;
              border-radius: 5px 5px 0 0;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }

            th, td {
              padding: 8px;
              text-align: center;
            }
            th {
              border: none;
              background: linear-gradient(to left, #ae8625 0%, #f5d67d 25%, #d2ac47 50%, #edc967 75%, #ae8625 100%);
              color: #333;
            }
            td {
              border: none;

            }
            .text-right {
              text-align: right;
            }
            .order-info table {
              width: 100%;
              table-layout: fixed;
            }

            table tr:nth-child(even) {
              background-color: rgba(174, 134, 37, 0.15);
            }

            .order-info th,
            .order-info td {
              width: 33%; /* 4 columns evenly */
            }

            /* For Scrap/Bullion Items (4 columns) */
            .table-container table {
              table-layout: fixed;
            }

            .table-container th:nth-child(1) {
              width: 35%;
            },
            .table-container th:nth-child(2),
            .table-container th:nth-child(3),
            .table-container th:nth-child(4),
            .table-container th:nth-child(5);

          .step {
            display: flex;
            flex-direction: column;
          }
          .step h3 {
            margin: 4px;
          }
          .step p {
            margin-top: 0;
            margin-bottom: 32px;
          }
          .package-area {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            gap: 50px;
            width: 100%;
            align-items: center;
            margin-bottom: 50px;
          }

          .package-details {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .package-details-title {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 4px;
          }

          </style>

        </head>
        <body>
          <div class="page">
            <div class="header">
              <div class="header-content">
                <img src="data:image/png;base64,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" alt="Dorado Logo" style="width: 60px; height: auto; margin-right: 10px;" />
                <div class="logo">
                  <div class="company-name">Dorado Metals Exchange</div>
                  <div class="contact-info">
                    <span>support@doradometals.com</span>
                    <span>${formatPhoneNumber(
                      process.env.FEDEX_DORADO_PHONE_NUMBER
                    )}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="packing-title">Packing List</div>
            <div class="packing-subtitle">Make sure to place this packing list in your package!</div>

            <div class="shipping-info">              
              <div class="shipping-box">
                <h3>Shipping From:</h3>
                <div>
                  <h4>${purchaseOrder.address.name}</h4>
                  <p>
                    ${purchaseOrder.address.line_1} ${
    purchaseOrder.address.line_2
  }<br/>
                   ${purchaseOrder.address.city}, ${
    purchaseOrder.address.state
  } ${purchaseOrder.address.zip}
                  </p>
                  <p>
                    ${formatPhoneNumber(purchaseOrder.address.phone_number)}
                  </p>
                </div>
              </div>

              <div class="shipping-box">
                <h3>Shipping To:</h3>
                <div>
                  <h4>${process.env.FEDEX_DORADO_NAME}</h4>
                  <p>
                    ${process.env.FEDEX_RETURN_ADDRESS_LINE_1} ${
    process.env.FEDEX_RETURN_ADDRESS_LINE_2
  }<br/>
                    ${process.env.FEDEX_RETURN_CITY}, ${
    process.env.FEDEX_RETURN_STATE
  } ${process.env.FEDEX_RETURN_ZIP}
                  </p>
                  <p>
                    ${formatPhoneNumber(process.env.FEDEX_DORADO_PHONE_NUMBER)}
                  </p>
                </div>
              </div>

              <div class="details">
                <h3>Shipment Details:</h3>
                <div class="detail-content">
                  <div class="detail-row">
                    <span class="detail-label">Tracking Number:</span>
                    <span class="detail-value">${
                      purchaseOrder.shipment?.tracking_number || "-"
                    }</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Service:</span>
                    <span class="detail-value">${
                      purchaseOrder.shipment.shipping_service
                    }</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Package Size:</span>
                    <span class="detail-value">${
                      purchaseOrder.shipment?.package || "-"
                    }</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Pickup Type:</span>
                    <span class="detail-value">${
                      purchaseOrder.shipment?.pickup_type || "-"
                    }</span>
                  </div>
                  ${
                    purchaseOrder.shipment?.pickup_type === "Store Dropoff"
                      ? ""
                      : `
                        <div class="detail-row">
                          <span class="detail-label">Pickup Date:</span>
                          <span class="detail-value">
                            8:30AM ${new Date().toLocaleDateString("en-US", {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                      `
                  }
                  <div class="detail-row">
                    <span class="detail-label">Shipping Cost:</span>
                    <span class="detail-value"> ${purchaseOrder.shipment?.shipping_charge.toLocaleString(
                      "en-US",
                      {
                        style: "currency",
                        currency: "USD",
                      }
                    )}</span>
                  </div>
                  
                  ${
                    payoutFee > 0
                      ? `
                  <div class="detail-row">
                    <span class="detail-label">Payout Fee:</span>
                    <span class="detail-value">${payoutFee.toLocaleString(
                      "en-US",
                      {
                        style: "currency",
                        currency: "USD",
                      }
                    )}</span>
                  </div>
                  `
                      : ""
                  }
                  
                </div>
              </div>
              </div>
            </div>

            <div class="order-info">
              <table>
                <thead>
                  <tr>
                    <th>Order Placed</th>
                    <th>Order Number</th>
                    <th>Total Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>${new Date(
                      purchaseOrder.created_at
                    ).toLocaleDateString()}</td>
                    <td>PO-${purchaseOrder.order_number
                      .toString()
                      .padStart(6, "0")}</td>
                    <td>
                      ${total.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })} 
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            ${
              bullionItems
                ? `
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Bullion Products</th>
                    <th>Metal</th>
                    <th>Quantity</th>
                    <th>Content</th>
                    <th>Bullion Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  ${bullionItems}
                </tbody>
              </table>
            </div>
            `
                : ""
            }

            ${
              scrapItems
                ? `
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Scrap Line Items</th>
                    <th>Pre-Melt</th>
                    <th>Purity</th>
                    <th>Content</th>
                    <th>Scrap Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  ${scrapItems}
                </tbody>
              </table>
            </div>
            `
                : ""
            }
          
            <div style="page-break-before: always; font-family: Arial, sans-serif; padding: 20px; font-size: 12px;">
              <div class="packing-title">Shipping Instructions</div>
              <div class="packing-subtitle">Please be sure to read and follow instructions carefully to prevent any issues with your shipment!</div>
          
              <div class="step">
                <h3>1) Print packing list and label.</h3>
                <p>
                  Please print out your packing list and include it inside your package.
                  You will also need to print off the label we have generated on your behalf and
                  attach it to the outside of your package. If you choose to use your own label,
                  please send your items (with the packing list inside) to the following address: ${
                    process.env.FEDEX_DORADO_NAME
                  } ${process.env.FEDEX_RETURN_ADDRESS_LINE_1} ${
    process.env.FEDEX_RETURN_ADDRESS_LINE_2
  } ${process.env.FEDEX_RETURN_CITY}, ${process.env.FEDEX_RETURN_STATE} ${
    process.env.FEDEX_RETURN_ZIP
  }.
                </p>
              </div>
              <div class="step">
                <h3>2) Pack your items.</h3>
                <p>
                  Pack your items in a medium box. Make sure to take pictures of your items in case of insurance claims prior to packing. Dimensions shown below. Any fees incurred from incorrect package sizing
                  will be deducted from your payout. If you believe your items value to be greater than $5,000, you must double box your items. Furthermore, the packaging should not allow your items to be displayed or seen. Do not disclose the contents of your shipment to any other party, including shipping carrier employees. If you need to change your package size or need more than one package,
                  please call us. If you have changed your mind on including an item, or forgot to add one earlier — no worries.
                  Simply include or omit it from your shipment, and we’ll update your order accordingly once we receive it.
                </p>
                <div class="package-area">
                  <div class="package-details">
                    <div class="package-details-title">${
                      packageDetails.label
                    }</div>
                    <div>Length: ${dimensions.length} in</div>
                    <div>Width: ${dimensions.width} in</div>
                    <div>Height: ${dimensions.height} in</div>
                  </div>
                  ${svgBox}
                </div>
              </div>
              <div class="step">
                ${pickupInstruction}
              </div>
              <div class="step">
                <h3>4) Done!</h3>
                <p>
                  We’ll take care of the rest. You will receive an email as soon as we get your shipment.
                  Furthermore, once your label is scanned by FedEx, we’ll begin providing status updates
                  of your shipment on the order screen. You can optionally obtain a printed receipt with the tracking number attached, this will help with any nessecary insurance claims.
                </p>
              </div>
            </div>

            <div style="page-break-before: always; display: flex; justify-content: center; align-items: center; height: 100vh;">
              <img
                src="data:image/png;base64,${
                  purchaseOrder.shipment?.shipping_label || ""
                }"
                alt="Shipping Label"
                style="width: 288pt; height: 432pt;"
              />
            </div>
          </div>
        </body>
      </html>
    `;

  await page.setContent(htmlContent, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `
        <div style="font-size:10px; width:100%; text-align:right; padding-right:20px;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `,
    footerTemplate: `<div></div>`, // no footer
    margin: {
      top: "20px",
      bottom: "20px",
      left: "15px",
      right: "15px",
    },
  });

  await browser.close();
  return pdfBuffer;
}

export async function generateReturnPackingList({
  purchaseOrder,
  spotPrices = [],
}) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();

  const total =
    purchaseOrder.shipment.shipping_charge +
    purchaseOrder.return_shipment.shipping_charge;

  const rawScrapItems = purchaseOrder.order_items.filter(
    (item) => item.item_type === "scrap" && item.scrap
  );
  const scrapItemsWithNames = assignScrapItemNames(rawScrapItems);
  const scrapItems = scrapItemsWithNames
    .map((item) => {
      const scrap = item.scrap || {};
      const spot = spotPrices.find((s) => s.type === scrap.metal);
      const price =
        item.price != null ? item.price : getScrapPrice(scrap.content, spot);

      return `
        <tr>
          <td>${scrap.name || "Scrap Item"}</td>
          <td>${scrap.pre_melt || "-"} ${scrap.gross_unit || ""}</td>
          <td>${
            scrap.purity != null ? (scrap.purity * 100).toFixed(1) + "%" : "-"
          }</td>
          <td>${scrap.content.toFixed(3)}</td>
          <td>
            ${
              price
                ? price.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })
                : "-"
            }
          </td>
        </tr>
      `;
    })
    .join("");

  const bullionItems = purchaseOrder.order_items
    .filter((item) => item.item_type === "product" && item.product)
    .map((item) => {
      const product = item.product || {};
      const spot = spotPrices.find((s) => s.type === product.metal_type);
      const unitPrice =
        item.price != null ? item.price : getProductBidPrice(product, spot);
      const totalPrice = unitPrice * item.quantity;

      return `
        <tr>
          <td>${product.product_name || "Bullion Product"}</td>
          <td>${product.metal_type || "-"}</td>
          <td>${item.quantity}</td>
          <td>${product.content || "-"}</td>
          <td>
            ${
              totalPrice
                ? totalPrice.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })
                : "-"
            }
          </td>
        </tr>
      `;
    })
    .join("");

  const htmlContent = `
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              background: white;
            }
            .page {
              background: white;
              position: relative;
            }
            .header {
              display: flex;
              flex-direction: column;
              padding-bottom: 10px;
              margin-bottom: 20px;
            }
            .header-content {
              display: flex;
              align-items: center;
            }
            .logo {
              display: flex;
              flex-direction: column;
              align-items: flex-start;
            }
            .company-name {
              font-size: 20px;
              font-weight: bold;
              margin-bottom: 4px;
            }
            .contact-info {
              display: flex;
              justify-content: space-between;
              width: 100%;
              font-size: 10px;
              color: #666;
            }
            .packing-title {
              font-size: 20px;
              font-weight: bold;
              margin-top: 10px;
              margin-bottom: 5px;
            }
            .packing-subtitle {
              font-size: 12px;
              margin-bottom: 20px;
            }
            .shipping-info {
              display: flex;
              justify-content: space-between;
              gap: 5px;
              margin-bottom: 20px;
            }
            .shipping-box {
              border-left-width: 1px;
              border-left-style: solid;
              border-image: linear-gradient(to bottom, #ae8625, #f5d67d, #d2ac47, #edc967, #ae8625) 1;
              border-radius: 0;
              width: 30%;
              font-size: 12px;
              margin: 0;
            }
            .shipping-box h3 {
              background: linear-gradient(to left, #ae8625 0%, #f5d67d 25%, #d2ac47 50%, #edc967 75%, #ae8625 100%);
              margin: 0;
              padding: 5px;
              font-size: 12px;
            }
            .shipping-box h4 {
              font-size: 14px;
              margin: 0 0 12px 0; /* Top margin 0, bottom margin 4px */
              font-weight: bold;
            }

            .shipping-box p {
              font-size: 12px;
              margin: 0; /* No default margin on paragraphs */
              margin-top: 8px;
              line-height: 1.4;
            }
            .shipping-box div {
              padding: 10px;
            }
            .details {
              display: flex;
              flex-direction: column;
              width: 40%;
              padding: 0;
              border-left-width: 1px;
              border-left-style: solid;
              border-image: linear-gradient(to bottom, #ae8625, #f5d67d, #d2ac47, #edc967, #ae8625) 1;
              font-size: 12px;
            }

            .details h3 {
              background: linear-gradient(to left, #ae8625 0%, #f5d67d 25%, #d2ac47 50%, #edc967 75%, #ae8625 100%);
              margin: 0;
              padding: 5px;
              font-size: 12px;
              text-align: left;
            }

            .detail-content {
              display: flex;
              flex-direction: column;
              gap: 6px;
              padding: 10px;
            }

            .detail-row {
              display: flex;
              justify-content: space-between;
            }
            .detail-label {
              font-weight: normal;
              white-space: nowrap;
            }
            .detail-value {
              font-weight: bold;
            }
            .order-info, .table-container {
              margin-bottom: 20px;
            }
            .section-header {
              background: linear-gradient(to left, #ae8625 0%, #f5d67d 25%, #d2ac47 50%, #edc967 75%, #ae8625 100%);
              padding: 8px;
              font-weight: bold;
              font-size: 14px;
              border-radius: 5px 5px 0 0;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }

            th, td {
              padding: 8px;
              text-align: center;
            }
            th {
              border: none;
              background: linear-gradient(to left, #ae8625 0%, #f5d67d 25%, #d2ac47 50%, #edc967 75%, #ae8625 100%);
              color: #333;
            }
            td {
              border: none;

            }
            .text-right {
              text-align: right;
            }
            .order-info table {
              width: 100%;
              table-layout: fixed;
            }

            table tr:nth-child(even) {
              background-color: rgba(174, 134, 37, 0.15);
            }

            .order-info th,
            .order-info td {
              width: 33%; /* 4 columns evenly */
            }

            /* For Scrap/Bullion Items (4 columns) */
            .table-container table {
              table-layout: fixed;
            }

            .table-container th:nth-child(1) {
              width: 35%;
            },
            .table-container th:nth-child(2),
            .table-container th:nth-child(3),
            .table-container th:nth-child(4),
            .table-container th:nth-child(5);

          .step {
            display: flex;
            flex-direction: column;
          }
          .step h3 {
            margin: 4px;
          }
          .step p {
            margin-top: 0;
            margin-bottom: 32px;
          }
          .package-area {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            gap: 50px;
            width: 100%;
            align-items: center;
            margin-bottom: 50px;
          }

          .package-details {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .package-details-title {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 4px;
          }

          </style>

        </head>
        <body>
          <div class="page">
            <div class="header">
              <div class="header-content">
                <img src="data:image/png;base64,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" alt="Dorado Logo" style="width: 60px; height: auto; margin-right: 10px;" />
                <div class="logo">
                  <div class="company-name">Dorado Metals Exchange</div>
                  <div class="contact-info">
                    <span>support@doradometals.com</span>
                    <span>${formatPhoneNumber(
                      process.env.FEDEX_DORADO_PHONE_NUMBER
                    )}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="packing-title">Return Packing List</div>
            <div class="packing-subtitle">This packing list is for Dorado Metals use only.</div>

            
              <div class="shipping-info">              

              <div class="shipping-box">
                <h3>Shipping From:</h3>
                <div>
                  <h4>${process.env.FEDEX_DORADO_NAME}</h4>
                  <p>
                    ${process.env.FEDEX_RETURN_ADDRESS_LINE_1} ${
    process.env.FEDEX_RETURN_ADDRESS_LINE_2
  }<br/>
                    ${process.env.FEDEX_RETURN_CITY}, ${
    process.env.FEDEX_RETURN_STATE
  } ${process.env.FEDEX_RETURN_ZIP}
                  </p>
                  <p>
                    ${formatPhoneNumber(process.env.FEDEX_DORADO_PHONE_NUMBER)}
                  </p>
                </div>
              </div>

              <div class="shipping-box">
                <h3>Shipping To:</h3>
                <div>
                  <h4>${purchaseOrder.address.name}</h4>
                  <p>
                    ${purchaseOrder.address.line_1} ${
    purchaseOrder.address.line_2
  }<br/>
                   ${purchaseOrder.address.city}, ${
    purchaseOrder.address.state
  } ${purchaseOrder.address.zip}
                  </p>
                  <p>
                    ${formatPhoneNumber(purchaseOrder.address.phone_number)}
                  </p>
                </div>
              </div>

              <div class="details">
                <h3>Shipment Details:</h3>
                <div class="detail-content">
                  <div class="detail-row">
                    <span class="detail-label">Tracking Number:</span>
                    <span class="detail-value">${
                      purchaseOrder.return_shipment?.tracking_number || "-"
                    }</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Service:</span>
                    <span class="detail-value">${
                      purchaseOrder.return_shipment.shipping_service
                    }</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Package Size:</span>
                    <span class="detail-value">${
                      purchaseOrder.return_shipment?.package || "-"
                    }</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Pickup Type:</span>
                    <span class="detail-value">${
                      purchaseOrder.return_shipment?.pickup_type || "-"
                    }</span>
                  </div>
                  ${
                    purchaseOrder.return_shipment?.pickup_type ===
                    "Store Dropoff"
                      ? ""
                      : `
                        <div class="detail-row">
                          <span class="detail-label">Pickup Date:</span>
                          <span class="detail-value">
                            8:30AM ${new Date().toLocaleDateString("en-US", {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                      `
                  }
                  <div class="detail-row">
                    <span class="detail-label">Shipping Cost:</span>
                    <span class="detail-value"> ${purchaseOrder.return_shipment?.shipping_charge.toLocaleString(
                      "en-US",
                      {
                        style: "currency",
                        currency: "USD",
                      }
                    )}</span>
                  </div>
                  
                  
                  
                </div>
              </div>
              </div>
            </div>

            <div class="order-info">
              <table>
                <thead>
                  <tr>
                    <th>Order Placed</th>
                    <th>Order Number</th>
                    <th>Total Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>${new Date(
                      purchaseOrder.created_at
                    ).toLocaleDateString()}</td>
                    <td>PO-${purchaseOrder.order_number
                      .toString()
                      .padStart(6, "0")}</td>
                    <td>
                      -${total.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })} 
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            ${
              bullionItems
                ? `
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Bullion Products</th>
                    <th>Metal</th>
                    <th>Quantity</th>
                    <th>Content</th>
                    <th>Bullion Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  ${bullionItems}
                </tbody>
              </table>
            </div>
            `
                : ""
            }

            ${
              scrapItems
                ? `
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Scrap Line Items</th>
                    <th>Pre-Melt</th>
                    <th>Purity</th>
                    <th>Content</th>
                    <th>Scrap Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  ${scrapItems}
                </tbody>
              </table>
            </div>
            `
                : ""
            }              

            <div style="page-break-before: always; display: flex; justify-content: center; align-items: center; height: 100vh;">
              <img
                src="data:image/png;base64,${
                  purchaseOrder.return_shipment?.shipping_label || ""
                }"
                alt="Shipping Label"
                style="width: 288pt; height: 432pt;"
              />
            </div>
          </div>
        </body>
      </html>
    `;

  await page.setContent(htmlContent, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `
        <div style="font-size:10px; width:100%; text-align:right; padding-right:20px;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `,
    footerTemplate: `<div></div>`, // no footer
    margin: {
      top: "20px",
      bottom: "20px",
      left: "15px",
      right: "15px",
    },
  });

  await browser.close();
  return pdfBuffer;
}

export async function generateInvoice({
  purchaseOrder,
  spotPrices = [],
  orderSpots = [],
}) {
  const doneStatus = ["Accepted", "Payment Processing", "Completed"];

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();

  const spots = purchaseOrder.spots_locked ? orderSpots : spotPrices;
  const total = calculateTotalPrice(purchaseOrder, spots);
  const payoutCost = purchaseOrder.payout.cost;
  const payoutDelay =
    purchaseOrder.payout.method === "WIRE"
      ? "1-5 hours"
      : purchaseOrder.payout.method === "ACH"
      ? "1-24 hours"
      : "Instant";
  const rawScrapItems = purchaseOrder.order_items.filter(
    (item) => item.item_type === "scrap" && item.scrap
  );
  const scrapItemsWithNames = assignScrapItemNames(rawScrapItems);
  const scrapItems = scrapItemsWithNames
    .map((item) => {
      const scrap = item.scrap || {};
      const spot = spots.find((s) => s.type === scrap.metal);
      const price =
        item.price != null ? item.price : calculateItemPrice(item, spots);

      return `
        <tr>
          <td class="text-left">${scrap.name || "Scrap Item"}</td>
                    <td>${scrap.pre_melt} ${scrap.gross_unit || ""}</td>
          <td>${scrap.post_melt ?? scrap.pre_melt} ${
        scrap.gross_unit || ""
      }</td>
          <td>${
            scrap.purity != null ? (scrap.purity * 100).toFixed(1) + "%" : "-"
          }</td>
          <td>${scrap.content.toFixed(3)} t oz</td>
          <td>${(spot.scrap_percentage * 100).toFixed(1)}%</td>
          <td class="text-right">
            ${
              price
                ? price.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })
                : "-"
            }
          </td>
        </tr>
      `;
    })
    .join("");

  const scrapTotal = getScrapTotal(rawScrapItems, spots);

  const bullionItems = purchaseOrder.order_items
    .filter((item) => item.item_type === "product" && item.product)
    .map((item) => {
      const product = item.product || {};
      const unitPrice =
        item.price != null ? item.price : calculateItemPrice(item, spots);
      const totalPrice = unitPrice * item.quantity;

      return `
        <tr>
          <td class="text-left">${
            product.product_name || "Bullion Product"
          }</td>
          <td>${item.quantity}</td>
          <td>${product.content.toFixed(3)} t oz</td>
          <td>${(item.bullion_premium * 100).toFixed(1)}% of spot</td>
          <td class="text-right">
            ${
              totalPrice
                ? totalPrice.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })
                : "-"
            }
          </td>
        </tr>
      `;
    })
    .join("");

  const bullionTotal = getBullionTotal(
    purchaseOrder.order_items.filter(
      (item) => item.item_type === "product" && item.product
    ),
    spots
  );

  const htmlContent = `
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              background: white;
            }
            .page {
              background: white;
              position: relative;
            }
            .header {
              display: flex;
              flex-direction: column;
              padding-bottom: 10px;
              margin-bottom: 20px;
            }
            .header-content {
              display: flex;
              align-items: center;
            }
            .logo {
              display: flex;
              flex-direction: column;
              align-items: flex-start;
            }
            .company-name {
              font-size: 20px;
              font-weight: bold;
              margin-bottom: 4px;
            }
            .contact-info {
              display: flex;
              justify-content: space-between;
              width: 100%;
              font-size: 10px;
              color: #666;
            }
            .packing-title {
              font-size: 20px;
              font-weight: bold;
              margin-top: 10px;
              margin-bottom: 5px;
            }
            .packing-subtitle {
              font-size: 12px;
              margin-bottom: 20px;
            }
            .shipping-info {
              display: flex;
              justify-content: space-between;
              gap: 5px;
              margin-bottom: 20px;
            }
            .shipping-box {
              border-left-width: 1px;
              border-left-style: solid;
              border-image: linear-gradient(to bottom, #ae8625, #f5d67d, #d2ac47, #edc967, #ae8625) 1;
              border-radius: 0;
              width: 30%;
              font-size: 12px;
              margin: 0;
            }
            .shipping-box h3 {
              background: linear-gradient(to left, #ae8625 0%, #f5d67d 25%, #d2ac47 50%, #edc967 75%, #ae8625 100%);
              margin: 0;
              padding: 5px;
              font-size: 12px;
            }
            .shipping-box h4 {
              font-size: 14px;
              margin: 0 0 12px 0; /* Top margin 0, bottom margin 4px */
              font-weight: bold;
            }

            .shipping-box p {
              font-size: 12px;
              margin: 0; /* No default margin on paragraphs */
              margin-top: 8px;
              line-height: 1.4;
            }
            .shipping-box div {
              padding: 10px;
            }
            .details {
              display: flex;
              flex-direction: column;
              width: 40%;
              padding: 0;
              border-left-width: 1px;
              border-left-style: solid;
              border-image: linear-gradient(to bottom, #ae8625, #f5d67d, #d2ac47, #edc967, #ae8625) 1;
              font-size: 12px;
            }

            .details h3 {
              background: linear-gradient(to left, #ae8625 0%, #f5d67d 25%, #d2ac47 50%, #edc967 75%, #ae8625 100%);
              margin: 0;
              padding: 5px;
              font-size: 12px;
              text-align: left;
            }

            .detail-content {
              display: flex;
              flex-direction: column;
              gap: 6px;
              padding: 10px;
            }

            .detail-row {
              display: flex;
              justify-content: space-between;
            }
            .detail-label {
              font-weight: normal;
              white-space: nowrap;
            }
            .detail-value {
              font-weight: bold;
            }
            .order-info, .table-container {
              margin-bottom: 20px;
            }
            .section-header {
              background: linear-gradient(to left, #ae8625 0%, #f5d67d 25%, #d2ac47 50%, #edc967 75%, #ae8625 100%);
              padding: 8px;
              font-weight: bold;
              font-size: 14px;
              border-radius: 5px 5px 0 0;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }

            th, td {
              padding: 8px;
              text-align: center;
            }
            th {
              border: none;
              background: linear-gradient(to left, #ae8625 0%, #f5d67d 25%, #d2ac47 50%, #edc967 75%, #ae8625 100%);
              color: #333;
            }
            td {
              border: none;

            }
            .text-right {
              text-align: right;
            }
            .text-left {
              text-align: left;
            }
            .text-bold {
              font-weight: bold;
              font-size: 12px;
            }
            .order-info table {
              width: 100%;
              table-layout: fixed;
            }

            table tr:nth-child(even) {
              background-color: rgba(174, 134, 37, 0.15);
            }

            .order-info th,
            .order-info td {
              width: 33%; /* 4 columns evenly */
            }

            /* For Scrap/Bullion Items (4 columns) */
            .table-container table {
              table-layout: fixed;
            }

            .table-container th:nth-child(1) {
              width: 25%;
            },
            .table-container th:nth-child(2),
            .table-container th:nth-child(3),
            .table-container th:nth-child(4),
            .table-container th:nth-child(5);

          .step {
            display: flex;
            flex-direction: column;
          }
          .step h3 {
            margin: 4px;
          }
          .step p {
            margin-top: 0;
            margin-bottom: 32px;
          }
          .package-area {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            gap: 50px;
            width: 100%;
            align-items: center;
            margin-bottom: 50px;
          }

          .package-details {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .package-details-title {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 4px;
          }

          </style>

        </head>
        <body>
          <div class="page">
            <div class="header">
              <div class="header-content">
                <img src="data:image/png;base64,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" alt="Dorado Logo" style="width: 60px; height: auto; margin-right: 10px;" />
                <div class="logo">
                  <div class="company-name">Dorado Metals Exchange</div>
                  <div class="contact-info">
                    <span>support@doradometals.com</span>
                    <span>${formatPhoneNumber(
                      process.env.FEDEX_DORADO_PHONE_NUMBER
                    )}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="packing-title">${
              doneStatus.includes(purchaseOrder.purchase_order_status)
                ? "Purchase Order Invoice"
                : "Purchase Order Preview"
            } </div>
            <div class="packing-subtitle">${
              doneStatus.includes(purchaseOrder.purchase_order_status)
                ? "You have accepted our offer. View your final price breakdown below."
                : "Please note: until our offer has been accepted, prices seen here may not be representative of the final amounts and do not represent an obligation to purchase your items at these amounts."
            } </div>

            <div class="shipping-info">

              <div class="details">
                <h3>Order</h3>
                <div class="detail-content">
                  <div class="detail-row">
                    <span class="detail-label">Number:</span>
                    <span class="detail-value">PO-${purchaseOrder.order_number
                      .toString()
                      .padStart(6, "0")}
                      </span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Name:</span>
                    <span class="detail-value">${
                      purchaseOrder.user?.user_name ?? ""
                    }</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Placed:</span>
                    <span class="detail-value">${new Date(
                      purchaseOrder.created_at
                    ).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value">${
                      purchaseOrder.purchase_order_status
                    }</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Items:</span>
                    <span class="detail-value">${
                      purchaseOrder.order_items.length
                    }</span>
                  </div>
                </div>
              </div>

              <div class="details">
                <h3>Offer</h3>
                <div class="detail-content">
                  <div class="detail-row">
                    <span class="detail-label">${
                      doneStatus.includes(purchaseOrder.purchase_order_status)
                        ? "Total Payout"
                        : "Total Estimate"
                    }</span>
                    <span class="detail-value">${total.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value">${
                      purchaseOrder.offer_status
                    }</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Sent:</span>
                    <span class="detail-value">${
                      purchaseOrder.offer_sent_at
                        ? new Date(
                            purchaseOrder.offer_sent_at
                          ).toLocaleDateString("en-US", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "N/A"
                    }</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Expires:</span>
                    <span class="detail-value">${
                      purchaseOrder.offer_expires_at
                        ? new Date(
                            purchaseOrder.offer_expires_at
                          ).toLocaleDateString("en-US", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "N/A"
                    }</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Rejections:</span>
                    <span class="detail-value">${
                      purchaseOrder.num_rejections
                    }</span>
                  </div>
                </div>
              </div>

              <div class="details">
                <h3>Spots</h3>
                <div class="detail-content">
                  <div class="detail-row">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value">${
                      purchaseOrder.spots_locked ? "Locked" : "Unlocked"
                    }</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Gold:</span>
                    <span class="detail-value">${spots
                      .find((s) => s.type === "Gold")
                      .bid_spot.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Silver:</span>
                    <span class="detail-value">${spots
                      .find((s) => s.type === "Silver")
                      .bid_spot.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Platinum:</span>
                    <span class="detail-value">${spots
                      .find((s) => s.type === "Platinum")
                      .bid_spot.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Palladium:</span>
                    <span class="detail-value">${spots
                      .find((s) => s.type === "Palladium")
                      .bid_spot.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="order-info">
              <table>
                <thead>
                  <tr>
                    <th class="text-left">Shipping Type</th>
                    <th>Service</th>
                    <th>Insured</th>
                    <th>Packaging</th>
                    <th class="text-right">Charges</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="text-left">Inbound</td>
                    <td>${purchaseOrder.shipment.shipping_service}</td>
                    <td>${purchaseOrder.shipment.insured ? "Yes" : "No"}</td>
                    <td>${purchaseOrder.shipment.package}</td>
                    <td class="text-right">${purchaseOrder.shipment.shipping_charge.toLocaleString(
                      "en-US",
                      {
                        style: "currency",
                        currency: "USD",
                      }
                    )}</td>
                  </tr>
                  ${
                    purchaseOrder.purchase_order_status === "Cancelled"
                      ? `<tr>
                          <td class="text-left">Return</td>
                          <td>${
                            purchaseOrder.return_shipment?.shipping_service
                          }</td>
                          <td>${
                            purchaseOrder.return_shipment?.insured
                              ? "Yes"
                              : "No"
                          }</td>
                          <td>${purchaseOrder.return_shipment?.package}</td>
                          <td class="text-right">${(
                            purchaseOrder.return_shipment?.shipping_charge ?? 0
                          ).toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                          })}</td>
                        </tr>`
                      : ""
                  }
                </tbody>
              </table>
            </div>

            <div class="order-info">
              <table>
                <thead>
                  <tr>
                    <th class="text-left">Payout Method</th>
                    <th>Transfer Time</th>
                    <th class="text-right">Charges</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="text-left">${purchaseOrder.payout.method}</td>
                    <td>${payoutDelay}</td>
                    <td class="text-right">${payoutCost?.toLocaleString(
                      "en-US",
                      {
                        style: "currency",
                        currency: "USD",
                      }
                    )}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            ${
              bullionItems
                ? `
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th class="text-left">Bullion Products</th>
                    <th>Quantity</th>
                    <th>Content</th>
                    <th>Premium</th>
                    <th class="text-right">${
                      doneStatus.includes(purchaseOrder.purchase_order_status)
                        ? "Payout"
                        : "Estimate"
                    }</th>
                  </tr>
                </thead>
                <tbody>
                  ${bullionItems}
                </tbody>
              </table>
            </div>
            `
                : ""
            }

            ${
              scrapItems
                ? `
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th class="text-left">Line Items</th>
                    <th>Pre-Melt</th>
                    <th>Post-Melt</th>
                    <th>Purity</th>
                    <th>Content</th>
                    <th>Premium</th>
                    <th class="text-right">${
                      doneStatus.includes(purchaseOrder.purchase_order_status)
                        ? "Payout"
                        : "Estimate"
                    }</th>
                  </tr>
                </thead>
                <tbody>
                  ${scrapItems}
                </tbody>
              </table>
            </div>
            `
                : ""
            }

            <div class="order-info">
              <table>
                <thead>
                  <tr>
                    <th class="text-left">Name</th>
                    <th>Type</th>
                    <th class="text-right">${
                      doneStatus.includes(purchaseOrder.purchase_order_status)
                        ? "Payout"
                        : "Estimate"
                    }</th>
                  </tr>
                </thead>
                <tbody>
                             ${
                               scrapItems
                                 ? `
                  <tr>
                    <td class="text-left">Scrap Total</td>
                    <td>Addition</td>
                    <td class="text-right">${scrapTotal.toLocaleString(
                      "en-US",
                      {
                        style: "currency",
                        currency: "USD",
                      }
                    )}</td>
                  </tr>
                              `
                                 : ""
                             }
                  ${
                    bullionItems
                      ? `
                  <tr>
                    <td class="text-left">Bullion Total</td>
                    <td>Addition</td>
                    <td class="text-right">${bullionTotal.toLocaleString(
                      "en-US",
                      {
                        style: "currency",
                        currency: "USD",
                      }
                    )}</td>
                  </tr>
                              `
                      : ""
                  }
                  <tr>
                    <td class="text-left">Shipping Fees</td>
                    <td>Deduction</td>
                    <td class="text-right">-${(
                      purchaseOrder.shipment.shipping_charge +
                      (purchaseOrder.return_shipment?.shipping_charge ?? 0)
                    ).toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}</td>
                  </tr>
                  <tr>
                    <td class="text-left">Payout Fees</td>
                    <td>Deduction</td>
                    <td class="text-right">-${payoutCost?.toLocaleString(
                      "en-US",
                      {
                        style: "currency",
                        currency: "USD",
                      }
                    )}</td>
                  </tr>
                       

                  <tr>
                    <td class="text-left text-bold">Total: </td>
                    <td></td>
                    <td class="text-right text-bold">${total.toLocaleString(
                      "en-US",
                      {
                        style: "currency",
                        currency: "USD",
                      }
                    )}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </body>
      </html>
    `;

  await page.setContent(htmlContent, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `
        <div style="font-size:10px; width:100%; text-align:right; padding-right:20px;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `,
    footerTemplate: `<div></div>`, // no footer
    margin: {
      top: "20px",
      bottom: "20px",
      left: "15px",
      right: "15px",
    },
  });

  await browser.close();
  return pdfBuffer;
}

export async function generateSalesOrderInvoice({ salesOrder, spots = [] }) {
  const doneStatus = ["Preparing", "In Transit", "Completed"];

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();

  const bullionItems = salesOrder.order_items
    .filter((item) => item.product)
    .map((item) => {
      const product = item.product || {};
      return `
        <tr>
          <td class="text-left">${
            product.product_name || "Bullion Product"
          }</td>
          <td>${item.quantity}</td>
          <td>${product.content.toFixed(3)} t oz</td>
          <td class="text-right">
            ${(item.price * item.quantity).toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
            })}
          </td>
        </tr>
      `;
    })
    .join("");

  const htmlContent = `
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              background: white;
            }
            .page {
              background: white;
              position: relative;
            }
            .header {
              display: flex;
              flex-direction: column;
              padding-bottom: 10px;
              margin-bottom: 20px;
            }
            .header-content {
              display: flex;
              align-items: center;
            }
            .logo {
              display: flex;
              flex-direction: column;
              align-items: flex-start;
            }
            .company-name {
              font-size: 20px;
              font-weight: bold;
              margin-bottom: 4px;
            }
            .contact-info {
              display: flex;
              justify-content: space-between;
              width: 100%;
              font-size: 10px;
              color: #666;
            }
            .packing-title {
              font-size: 20px;
              font-weight: bold;
              margin-top: 10px;
              margin-bottom: 5px;
            }
            .packing-subtitle {
              font-size: 12px;
              margin-bottom: 20px;
            }
            .shipping-info {
              display: flex;
              justify-content: space-between;
              gap: 5px;
              margin-bottom: 20px;
            }
            .shipping-box {
              border-left-width: 1px;
              border-left-style: solid;
              border-image: linear-gradient(to bottom, #ae8625, #f5d67d, #d2ac47, #edc967, #ae8625) 1;
              border-radius: 0;
              width: 30%;
              font-size: 12px;
              margin: 0;
            }
            .shipping-box h3 {
              background: linear-gradient(to left, #ae8625 0%, #f5d67d 25%, #d2ac47 50%, #edc967 75%, #ae8625 100%);
              margin: 0;
              padding: 5px;
              font-size: 12px;
            }
            .shipping-box h4 {
              font-size: 14px;
              margin: 0 0 12px 0; /* Top margin 0, bottom margin 4px */
              font-weight: bold;
            }

            .shipping-box p {
              font-size: 12px;
              margin: 0; /* No default margin on paragraphs */
              margin-top: 8px;
              line-height: 1.4;
            }
            .shipping-box div {
              padding: 10px;
            }
            .details {
              display: flex;
              flex-direction: column;
              width: 40%;
              padding: 0;
              border-left-width: 1px;
              border-left-style: solid;
              border-image: linear-gradient(to bottom, #ae8625, #f5d67d, #d2ac47, #edc967, #ae8625) 1;
              font-size: 12px;
            }

            .details h3 {
              background: linear-gradient(to left, #ae8625 0%, #f5d67d 25%, #d2ac47 50%, #edc967 75%, #ae8625 100%);
              margin: 0;
              padding: 5px;
              font-size: 12px;
              text-align: left;
            }

            .detail-content {
              display: flex;
              flex-direction: column;
              gap: 6px;
              padding: 10px;
            }

            .detail-row {
              display: flex;
              justify-content: space-between;
            }
            .detail-label {
              font-weight: normal;
              white-space: nowrap;
            }
            .detail-value {
              font-weight: bold;
            }
            .order-info, .table-container {
              margin-bottom: 20px;
            }
            .section-header {
              background: linear-gradient(to left, #ae8625 0%, #f5d67d 25%, #d2ac47 50%, #edc967 75%, #ae8625 100%);
              padding: 8px;
              font-weight: bold;
              font-size: 14px;
              border-radius: 5px 5px 0 0;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }

            th, td {
              padding: 8px;
              text-align: center;
            }
            th {
              border: none;
              background: linear-gradient(to left, #ae8625 0%, #f5d67d 25%, #d2ac47 50%, #edc967 75%, #ae8625 100%);
              color: #333;
            }
            td {
              border: none;

            }
            .text-right {
              text-align: right;
            }
            .text-left {
              text-align: left;
            }
            .text-bold {
              font-weight: bold;
              font-size: 12px;
            }
            .order-info table {
              width: 100%;
              table-layout: fixed;
            }

            table tr:nth-child(even) {
              background-color: rgba(174, 134, 37, 0.15);
            }

            .order-info th,
            .order-info td {
              width: 33%; /* 4 columns evenly */
            }

            /* For Scrap/Bullion Items (4 columns) */
            .table-container table {
              table-layout: fixed;
            }

            .table-container th:nth-child(1) {
              width: 25%;
            },
            .table-container th:nth-child(2),
            .table-container th:nth-child(3),
            .table-container th:nth-child(4),
            .table-container th:nth-child(5);

          .step {
            display: flex;
            flex-direction: column;
          }
          .step h3 {
            margin: 4px;
          }
          .step p {
            margin-top: 0;
            margin-bottom: 32px;
          }
          .package-area {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            gap: 50px;
            width: 100%;
            align-items: center;
            margin-bottom: 50px;
          }

          .package-details {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .package-details-title {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 4px;
          }

          </style>

        </head>
        <body>
          <div class="page">
            <div class="header">
              <div class="header-content">
                <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAA8CAYAAAA6/NlyAAAACXBIWXMAAA7DAAAOwwHHb6hkAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAACLJJREFUaIHtm3+oZVUVxz9r7XPufSr9QLKYAUeHBJ0w+jFRgaQzk5NGNP4RjIOWQ6HQH5NggX/0V4VUlGDQhBWljqIUFBpDSOPEpEaRZFpYaobNcwZ/gFgziL53995r9cfe5973ng913twTOjML7rv77rP3Pmuds85a6/s9+4m7Mw3578PXnJlG+V/ZEpYzlhM517Ylcu0r/RlwVBVRRVVRDfVbEdFxW1URD+eu2nDzY9PQs5nGIgAySgISprXeItEsU1tqWgu9WeSEwce6HHcGTy1oxdDMkdOjwDoAnMcF/lOavG3cD49T+3m9/c3gpWnpKdNKSwAv/GnH5ui2x3LGU96y+oKf7Ab4957LNqcc91hOeE5bzrlk926AR+/81GaC7lFVQpAtZ33yrvH4ENhT09KW1RfcuntaOh53Ln3C4GNdThh8rMsJg491Oe4MnlqlBWCqI7I9DyDi812/SBoBzwPgMunHR971I0vGN3UdHfdPQ6ZSaR3627UftDg6OSWAiEd/Oqf51ZFEShFIpASkRIoJiJPJbVuuetPQ0IxvQSPt0wRf3dJC2wDMrTrvp38+Wl2ncofN/A5HzhbJZHNc8k5TdpBBUcwU8YzhiDo5C2PGwxxXRQ1cDbXCeAi2UzzscHXUDFHdD6w9Wl2n6tJL5Al3+bHjCIWwcC+/yk8BEVwEdwcHXKgHP9+XUv0ZLMyesemW61cydXbvtgumrU4n/RnsnPfUvu1PeM7kSuJ5JfYmJF5AVAiqiDRokI7EW4Vwcx9q9enShhOd4q3gLA6P9YgIjiNS2gAC08OsS6RPl/7jmk27Nq9k6uzebVPDv0tlKgaL+I+A01y83B6Rf+BcfGDf9q9aMoxETAmziKWEZQMMDQpj/rlFVYt7I2cR9JcO3yp+4CjywlR0nSbj0clz9121NmFPHg0RL8J7zrjwZ49OW7cjNvj5B69Z1Wi4q22HoIKZkdOoGJYy2ROW868sp0s8x6tTBIjEWoDEGCHVxap/tW077mgbEGmvR/hNCOHTQRXRUC5CUIIK7pBixONo66pNt88eif5H7NI5p5mgzYedmjF93CpfxasfEJiLEmYZAC/N0aK8xADaCKO62Ag4BSKRkzml9CXw1l4O6LuAyXm69N2dBED9pCPVv7eg5XC+uj1jOWONknMm5IRlJYcFLp2KG0dNE5cupj3eh159pqWDwK/HCcYBEYTunnnNSg4yGVTrsov7UqrPtPTYmo27vriSqW/4tLSsOB+Y3XfF3Z4Nt0g0w2PEzYi5oKUQFJWAiCAhEDSgKojoeoT9fah1xAa7Nc4ifLfMGJEMnCrIx0seFcQpQAHqM1pc2guG6OAFtdW4SBaIr/ae1D0ceU5196l/nr33yrUH7/vCPSudv/+eS3fvv+fSdX3o9pp5+JG7t717Rtv1g8GAMBgwGAwIoXyjgGVyXvgZ4Z4PWczfzTlfl3OGPFo0xnIGMhoChEAAwrgdENVrVcPXgsrJBAjUY3VsBvKorDkalXOORplRTg+9/zO7n3g1e17TpUPiIobyA68lvU9qfATBvBQClKtX3NVkJ/Be8J8LjlXcWyBwF5VrVnUHVRxBHcofRzxf5IQd6goq45zvqmVOfTwQrwnACdiXgRuOyuCjkEdc5NtSU05XNLhUnI8UA+pgERCvyAm+0pdSfaalZ8/YcMvtK5k6u3fbtmmr00mfaWnjU/u2v/j6wUNDUEEKeJhBuLEPtfp06UPAQw6vgPMyzjUd1O/cu6QvEd7Xl1J9uvRf1mx8ExIAEux+Qa6WLo/RFQ6loPBSUdAVGADufhDnkgO/2/59S4nkGU8FG6eUcMtlbS0RuFFFpUFU0EYR9FwXuU2cf47PJhTXmAS2CVJzx10Ixv2vac9xTwD8/uYNN7XN4MJ22NK0Q9p2QDsYMGgHhLZlMJj0i0oxJCWsbjmsWw9vM0vnz8+ny8uqL8MczDE3/gkvw0kTODvDDMx0SulNQfUBVf1sdzFEFRVFg1YCYERKmRgjKUVSLG85UkrEUSTlRErp/vOv/MPlC+1bzqVPQzh9DOqrTADc4v6xuy3ueytOG9TeARCjQhuR2AKRGEZAoB0BgzLHyJChpcUDA3F/C3D6K0+2WJtlpWM/nXcuPdRnlP6IiD5oOaMCOStKwrKjKOC4ZsSKG7s66oqpIa4g/LUPpfo0+EmEWzv+uUNE5eJP7oyMPz7+AJf1pVSfaenJNRt2fX0lU2f3bvvQtNXppM9K66MH9m1/OFvdO50Ms4hbIqXKS3dReUFgKq9ddO3/jwAQeQ6YXRQPlkHhE9ZymWPOIaBxeHs30CuI8CWll3vJtE7djlDO1ZpwOMAiCnZZMkCWhrDJ2ub+7DLKHWcEwJ3fOedLg2agbTukHTY0bUvbDGmGQ9q2qe2WYTtEm4a2HTIcljEEJcdYc7CRU8QwLOUDluI3s6cbLRpGJMfi0maJHA3IBfQv2OofQik+QK9S0W9oE1YFBaUBDWhQghYCwOYj0RIpRmLNwTEmLEXmo2EpEuPCvvLdiHMDEDqOqYLVArLHbRm7ngh4LSXFHZEuzta2OYLvRDgb43uIgzGhYr1rTwjbzjd9AcEg+Mdw3+GuuFbioHvL5F5U86JLWbdjysoD0iFtGRME5dR9pqUH3f1aMcVRDCt1sApqxUDcCxPijgmoG4YSXK5b/oE9eunT4MNx3uomFCUwgOZFAsDhOuJUmLxoSjinFn8N8VBfO6r6NHjjYCYcWgwehiVFnVTBw/xS8DBXnmFRgJ19KNWnwc/g/FZqse3dVgCpRPSEzRqHjwk3zca+lOqz0vr7mk27PreSqb0SAAJbRVCvEdrrdiIZg+0K+WtwEa8RULuIKTWilwjrIrhwGGfrU/uu+EXOGbdMzoblOP5vNQBVAenSUXnlEoIiIutN5IeNcK/XrUyFaKjUsFjVaXEk7sZ4Dcki1bO6rVHyBiYAcF135ifumMq/3y2U/wGlaDinrsAWTAAAAABJRU5ErkJggg==" alt="Dorado Logo" style="width: 60px; height: auto; margin-right: 10px;" />
                <div class="logo">
                  <div class="company-name">Dorado Metals Exchange</div>
                  <div class="contact-info">
                    <span>support@doradometals.com</span>
                    <span>${formatPhoneNumber(
                      process.env.FEDEX_DORADO_PHONE_NUMBER
                    )}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="packing-title">${
              doneStatus.includes(salesOrder.sales_order_status)
                ? "Sales Order Invoice"
                : "Sales Order Preview"
            } </div>
            <div class="packing-subtitle">Items and price details contained below.</div>

            <div class="shipping-info">

              <div class="details">
                <h3>Order</h3>
                <div class="detail-content">
                  <div class="detail-row">
                    <span class="detail-label">Number:</span>
                    <span class="detail-value">SO-${salesOrder.order_number
                      .toString()
                      .padStart(6, "0")}
                      </span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Name:</span>
                    <span class="detail-value">${
                      salesOrder.user?.user_name ?? ""
                    }</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Placed:</span>
                    <span class="detail-value">${new Date(
                      salesOrder.created_at
                    ).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value">${
                      salesOrder.sales_order_status
                    }</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Items:</span>
                    <span class="detail-value">${
                      salesOrder.order_items.length
                    }</span>
                  </div>
                </div>
              </div>

              <div class="details">
                <h3>Shipping To</h3>
                <div class="detail-content">
                  <div class="detail-row">
                    <span class="detail-label">Street 1:</span>
                    <span class="detail-value">${
                      salesOrder.address.line_1
                    }</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Street 2:</span>
                    <span class="detail-value">${
                      salesOrder.address.line_2
                    }</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">City:</span>
                    <span class="detail-value">${salesOrder.address.city}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">State:</span>
                    <span class="detail-value">${
                      salesOrder.address.state
                    }</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Zip Code:</span>
                    <span class="detail-value">${salesOrder.address.zip}</span>
                  </div>
                </div>
              </div>

              <div class="details">
                <h3>Spots</h3>
                <div class="detail-content">
                  <div class="detail-row">
                    <span class="detail-label">Gold:</span>
                    <span class="detail-value">${spots
                      .find((s) => s.type === "Gold")
                      .ask_spot.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Silver:</span>
                    <span class="detail-value">${spots
                      .find((s) => s.type === "Silver")
                      .ask_spot.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Platinum:</span>
                    <span class="detail-value">${spots
                      .find((s) => s.type === "Platinum")
                      .ask_spot.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Palladium:</span>
                    <span class="detail-value">${spots
                      .find((s) => s.type === "Palladium")
                      .ask_spot.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}</span>
                  </div>
                </div>
              </div>
            </div>            

            ${
              bullionItems
                ? `
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th class="text-left">Order Items</th>
                    <th>Quantity</th>
                    <th>Content</th>
                    <th class="text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  ${bullionItems}
                </tbody>
              </table>
            </div>
            `
                : ""
            }

            

            <div class="order-info">
              <table>
                <thead>
                  <tr>
                    <th class="text-left">Charges</th>
                    <th class="text-right">Cost
                    </th>
                  </tr>
                </thead>
                <tbody>
          
                  ${
                    bullionItems
                      ? `
                  <tr>
                    <td class="text-left">Item Total</td>
                    <td class="text-right">${salesOrder.item_total.toLocaleString(
                      "en-US",
                      {
                        style: "currency",
                        currency: "USD",
                      }
                    )}</td>
                  </tr>
                              `
                      : ""
                  }
                  <tr>
                    <td class="text-left">Shipping Fee</td>
                    <td class="text-right">${salesOrder.shipping_cost.toLocaleString(
                      "en-US",
                      {
                        style: "currency",
                        currency: "USD",
                      }
                    )}</td>
                  </tr>

                  ${
                    salesOrder.used_funds
                      ? `
                      <tr>
                    <td class="text-left">Credit Applied</td>
                    <td class="text-right">-${salesOrder.pre_charges_amount.toLocaleString(
                      "en-US",
                      {
                        style: "currency",
                        currency: "USD",
                      }
                    )}</td>
                  </tr>
                    `
                      : ""
                  }

                  ${
                    salesOrder.charges_amount > 0
                      ? `
                      <tr>
                    <td class="text-left">Payment Fee</td>
                    <td class="text-right">${salesOrder.charges_amount.toLocaleString(
                      "en-US",
                      {
                        style: "currency",
                        currency: "USD",
                      }
                    )}</td>
                  </tr>
                    `
                      : ""
                  }
                       
                  <tr>
                    <td class="text-left text-bold">Total: </td>
                    <td class="text-right text-bold">${salesOrder.order_total.toLocaleString(
                      "en-US",
                      {
                        style: "currency",
                        currency: "USD",
                      }
                    )}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </body>
      </html>
    `;

  await page.setContent(htmlContent, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `
        <div style="font-size:10px; width:100%; text-align:right; padding-right:20px;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `,
    footerTemplate: `<div></div>`, // no footer
    margin: {
      top: "20px",
      bottom: "20px",
      left: "15px",
      right: "15px",
    },
  });

  await browser.close();
  return pdfBuffer;
}
