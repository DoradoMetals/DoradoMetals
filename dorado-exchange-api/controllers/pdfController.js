const puppeteer = require("puppeteer");

function formatPhoneNumber(value) {
  if (!value) return ''

  const digits = value.replace(/\D/g, '')

  const cleanDigits = digits.startsWith('1') ? digits.slice(1) : digits

  if (cleanDigits.length <= 3) return `(${cleanDigits}`
  if (cleanDigits.length <= 6) return `(${cleanDigits.slice(0, 3)}) ${cleanDigits.slice(3)}`
  return `(${cleanDigits.slice(0, 3)}) ${cleanDigits.slice(3, 6)}-${cleanDigits.slice(6, 10)}`
}


function getScrapPrice(content, spot) {
  if (!spot || !content) return 0;
  return content * (spot.bid_spot * spot.scrap_percentage)
}

function getProductBidPrice(product, spot) {
  if (!spot || !product) return 0;
  return (
     product.content * (spot.bid_spot * product.bid_premium)
  );
}

function assignScrapItemNames(scrapItems) {
  const metalOrder = ["Gold", "Silver", "Platinum", "Palladium"];

  const validScrapItems = scrapItems.filter((item) => item.scrap?.metal);

  validScrapItems.sort((a, b) => {
    const indexA = metalOrder.indexOf(a.scrap.metal);
    const indexB = metalOrder.indexOf(b.scrap.metal);
    return indexA - indexB;
  });

  const grouped = {};

  validScrapItems.forEach((item) => {
    const metal = item.scrap.metal;
    if (!grouped[metal]) grouped[metal] = [];
    grouped[metal].push(item);
  });

  return validScrapItems.map((item) => {
    const metal = item.scrap.metal;
    const group = grouped[metal];
    const index = group.indexOf(item);

    return {
      ...item,
      scrap: {
        ...item.scrap,
        name: `${metal} Item ${index + 1}`,
      },
    };
  });
}

const generatePackingList = async (req, res) => {
  const { purchaseOrder, spotPrices = [] } = req.body;

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage();

    const total = purchaseOrder.order_items.reduce((acc, item) => {
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
    }, 0);

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
          <td>${scrap.gross || "-"} ${scrap.gross_unit || ""}</td>
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
                    <span>${formatPhoneNumber(process.env.FEDEX_DORADO_PHONE_NUMBER)}</span>
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
                    <span class="detail-value">FedEx Ground</span>
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
                    <th>Gross</th>
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

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="packing-list.pdf"',
      "Content-Length": pdfBuffer.length,
    });

    res.end(pdfBuffer);
  } catch (error) {
    console.error("Error generating packing list:", error);
    res.status(500).json({ error: "Failed to generate packing list PDF." });
  }
};

module.exports = {
  generatePackingList,
};
