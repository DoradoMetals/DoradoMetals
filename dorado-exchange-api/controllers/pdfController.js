const puppeteer = require("puppeteer");

function getScrapPrice(content, spot) {
  if (!spot || !content) return 0;
  return content * spot.bid_spot;
}

function getProductBidPrice(product, spot) {
  if (!spot || !product) return 0;
  return product.content * spot.bid_spot + (product.bid_premium * product.content * spot.bid_spot);
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
      if (item.item_type === 'bullion') {
        const product = item.product;
        const spot = spotPrices.find((s) => s.type === product?.metal_type);
    
        const price = item.price ?? (product && spot
          ? product.content * spot.bid_spot + (product.bid_premium * product.content * spot.bid_spot)
          : 0);
    
        const quantity = item.quantity ?? 1;
        return acc + price * quantity;
      }
    
      if (item.item_type === 'scrap') {
        const scrap = item.scrap;
        const spot = spotPrices.find((s) => s.type === scrap?.metal);
    
        const price = item.price ?? (scrap && spot
          ? scrap.content * spot.bid_spot
          : 0);
    
        return acc + price;
      }
    
      return acc;
    }, 0);

    const rawScrapItems = purchaseOrder.order_items.filter((item) => item.item_type === "scrap" && item.scrap);
    const scrapItemsWithNames = assignScrapItemNames(rawScrapItems);
    const scrapItems = scrapItemsWithNames
    .map((item) => {
      const scrap = item.scrap || {};
      const spot = spotPrices.find((s) => s.type === scrap.metal);
      const price = item.price != null ? item.price : getScrapPrice(scrap.content, spot);

      return `
        <tr>
          <td>${scrap.name || "Scrap Item"}</td>
          <td>${scrap.purity != null ? (scrap.purity * 100).toFixed(1) + "%" : "-"}</td>
          <td>${scrap.gross || "-"} ${scrap.gross_unit || ""}</td>
          <td>${scrap.content.toFixed(3)}</td>
          <td class="text-right">
            ${price ? price.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "-"}
          </td>
        </tr>
      `;
    })
    .join("");

    const bullionItems = purchaseOrder.order_items
    .filter((item) => item.item_type === "bullion" && item.product)
    .map((item) => {
      const product = item.product || {};
      const spot = spotPrices.find((s) => s.type === product.metal_type);
      const unitPrice = item.price != null ? item.price : getProductBidPrice(product, spot);
      const totalPrice = unitPrice * quantity;
  
      return `
        <tr>
          <td>${product.product_name || "Bullion Product"}</td>
          <td>${product.metal_type || "-"}</td>
          <td>${product.quantity}</td>
          <td>${product.content || "-"}</td>
          <td class="text-right">
            ${totalPrice ? totalPrice.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "-"}
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
              border-bottom: 2px solid #ffb300;
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
              border-left: 1px solid #ffb300;
              border-radius: 0;
              width: 30%;
              font-size: 12px;
              margin: 0;
            }
            .shipping-box h3 {
              background: #ffb300;
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
              border-left: 1px solid #ffb300;
              font-size: 12px;
            }

            .details h3 {
              background: #ffb300;
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
              background: #ffb300;
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
              border: 1px solid #ffb300;
              padding: 8px;
              text-align: center;
            }
            th {
              background: #ffb300;
              color: #333;
            }
            .text-right {
              text-align: right;
            }
            .order-info table {
              width: 100%;
              table-layout: fixed;
            }

            table tr:nth-child(even) {
              background-color: rgba(240, 173, 0, 0.15); /* amber with 15% opacity */
            }

            .order-info th,
            .order-info td {
              width: 33%; /* 4 columns evenly */
            }

            /* For Scrap/Bullion Items (4 columns) */
            .table-container table {
              table-layout: fixed;
            }

            .table-container th:nth-child(1),
            .table-container th:nth-child(2),
            .table-container th:nth-child(3),
            .table-container th:nth-child(4),
            .table-container th:nth-child(5) {
              width: 20%;
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
                    <span>(817) 203-4786</span>
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
                    <th class="text-right">Price Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>${new Date(purchaseOrder.created_at).toLocaleDateString()}</td>
                    <td>PO-${purchaseOrder.order_number.toString().padStart(6, "0")}</td>
                    <td class="text-right">
                      ${total.toLocaleString("en-US", { style: "currency", currency: "USD" })} 
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
                    <th>Content</th>
                    <th>Quantity</th>
                    <th class="text-right">Price Estimate</th>
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
                    <th>Purity</th>
                    <th>Gross</th>
                    <th>Content</th>
                    <th class="text-right">Price Estimate</th>
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
