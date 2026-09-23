/* Shared receipt printing — used by cashier (index.html) and sales.html */

function money(v) { return `$${Number(v).toFixed(2)}`; }

function getUserForReceipt() {
  try {
    const raw = sessionStorage.getItem('pos-user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function printReceipt(sale) {
  const user = getUserForReceipt();
  const cashierName = user?.full_name || user?.username || sale.cashier_name || 'Cashier';
  const now = new Date();

  const orderNo = String(sale.saleId || sale.id).padStart(12, '0');
  const dateStr = new Date(sale.sold_at || now).toLocaleDateString('en-GB');
  const timeStr = new Date(sale.sold_at || now).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const taxRate = Number(sale.taxRate || 8);
  const subtotal = sale.items.reduce((s, i) => s + (i.isWeight ? i.price : i.price * i.qty || i.lineTotal), 0);
  const tax = subtotal * (taxRate / 100);
  const total = Number(sale.total) || (subtotal + tax);

  const lineRows = sale.items.map((i) => {
    if (i.isWeight) {
      const perUnit = i.unit === 'g' ? 'kg' : i.unit === 'ml' ? 'L' : i.unit;
      return `
        <tr>
          <td class="item-name">${i.name || i.productName}</td>
          <td class="qty">${i.qty}${i.unit} ×<br>${money(i.pricePerUnit || i.unitPrice)}/${perUnit}</td>
          <td class="amount">${money(i.price || i.lineTotal)}</td>
        </tr>`;
    }
    const qty = i.qty || i.quantity;
    const unitPrice = i.price || i.unitPrice;
    return `
      <tr>
        <td class="item-name">${i.name || i.productName}</td>
        <td class="qty">x ${qty}</td>
        <td class="amount">${money(unitPrice * qty)}</td>
      </tr>`;
  }).join('');

  const barcode = Array.from({ length: 60 }, () => {
    const w = Math.random() > 0.5 ? 1 : 2;
    return `<span style="display:inline-block;width:${w}px;height:100%;background:#000;margin-right:${Math.random() > 0.7 ? 2 : 0}px"></span>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt #${sale.saleId || sale.id}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; width: 76mm; margin: 0 auto;
    padding: 10px 6px 20px; color: #000; font-size: 12px; line-height: 1.35; }
  .center { text-align: center; }
  .store-name { font-size: 15px; font-weight: bold; margin-bottom: 2px; }
  .store-line { font-size: 11px; }
  .title { font-size: 14px; font-weight: bold; letter-spacing: 2px; margin: 10px 0 4px; }
  .barcode { height: 42px; margin: 10px auto; display: flex; align-items: flex-end; justify-content: center; overflow: hidden; }
  .info-table { width: 100%; margin: 12px 0 8px; font-size: 11.5px; }
  .info-table td { padding: 1.5px 0; vertical-align: top; }
  .info-table td:first-child { width: 42%; }
  .info-table td:last-child { text-align: right; font-weight: bold; }
  .divider { border-top: 1px dashed #000; margin: 8px 0; }
  .divider-solid { border-top: 2px solid #000; margin: 10px 0; }
  .items-table { width: 100%; font-size: 12px; border-collapse: collapse; }
  .items-table td { padding: 5px 0; vertical-align: top; }
  .items-table .item-name { width: 45%; font-weight: bold; }
  .items-table .qty { width: 30%; text-align: center; font-size: 11px; }
  .items-table .amount { width: 25%; text-align: right; font-weight: bold; }
  .totals { width: 100%; font-size: 12px; margin-top: 6px; }
  .totals td { padding: 2.5px 0; }
  .totals td:first-child { text-align: right; padding-right: 10px; }
  .totals td:last-child { text-align: right; width: 70px; }
  .totals .grand td { font-weight: bold; font-size: 14px; padding-top: 6px; border-top: 1px solid #000; }
  .payment-info { width: 100%; font-size: 12px; margin-top: 14px; }
  .payment-info td { padding: 3px 0; }
  .payment-info td:first-child { font-weight: bold; }
  .payment-info td:last-child { text-align: right; font-weight: bold; }
  .change-row td { font-size: 14px; font-weight: bold; padding-top: 6px; }
  .footer { text-align: center; margin-top: 18px; font-size: 12px; font-weight: bold; line-height: 1.5; }
</style></head><body>
  <div class="center">
    <div class="store-name">New Store X1</div>
    <div class="store-line">Some address</div>
    <div class="store-line">mnab, fd, 23rf</div>
    <div class="store-line">Phone: +333333333333</div>
    <div class="title">SALE</div>
  </div>
  <div class="barcode">${barcode}</div>
  <table class="info-table">
    <tr><td>Order #:</td><td>${orderNo}</td></tr>
    <tr><td>Sold To:</td><td>Walk-In</td></tr>
    <tr><td>Order Date:</td><td>${dateStr}</td></tr>
    <tr><td>Order Time:</td><td>${timeStr}</td></tr>
    <tr><td>Sales Person:</td><td>${cashierName}</td></tr>
    <tr><td>Register:</td><td>1</td></tr>
    <tr><td>Order type:</td><td>Quick Sale</td></tr>
  </table>
  <div class="divider-solid"></div>
  <table class="items-table">${lineRows}</table>
  <div class="divider"></div>
  <table class="totals">
    <tr><td>Subtotal</td><td>${money(subtotal)}</td></tr>
    <tr><td>Discount</td><td>($0.00)</td></tr>
    <tr><td>${taxRate}% Tax</td><td>${money(tax)}</td></tr>
    <tr class="grand"><td>Total</td><td>${money(total)}</td></tr>
  </table>
  <table class="payment-info">
    <tr><td>Cash Tendered</td><td>${money(total)}</td></tr>
    <tr class="change-row"><td>CHANGE DUE</td><td>${money(0)}</td></tr>
  </table>
  <div class="divider"></div>
  <div class="footer">
    <div>30% off your next order –</div>
    <div>if you order through us with code LOCAL!</div>
  </div>
</body></html>`;

  const win = window.open('', '_blank', 'width=400,height=650');
  if (!win) return alert('Allow pop-ups to print the receipt');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

window.printReceipt = printReceipt;