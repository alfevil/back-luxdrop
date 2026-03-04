const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;

  try {
    const orders = await db.query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );

    for (let order of orders.rows) {
      const items = await db.query(
        `SELECT oi.*, p.name, p.brand, p.images
         FROM order_items oi
         LEFT JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = $1`,
        [order.id]
      );
      order.items = items.rows;
    }

    res.json(orders.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;

  try {
    const order = await db.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const items = await db.query(
      `SELECT oi.*, p.name, p.brand, p.images
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [order.rows[0].id]
    );

    res.json({ ...order.rows[0], items: items.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;
  const { shipping_address, payment_method = 'card', notes } = req.body;

  if (!shipping_address) {
    return res.status(400).json({ error: 'Shipping address is required' });
  }

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const cart = await client.query(
      `SELECT ci.*, p.name, p.brand, p.price, p.images, p.stock
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.user_id = $1`,
      [req.user.id]
    );

    if (cart.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cart is empty' });
    }

    for (const item of cart.rows) {
      if (item.stock < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Not enough stock for ${item.name}` });
      }
    }

    const total = cart.rows.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const order = await client.query(
      `INSERT INTO orders (user_id, total_amount, shipping_address, payment_method, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, total, shipping_address, payment_method, notes]
    );

    for (const item of cart.rows) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price, size, color, product_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          order.rows[0].id,
          item.product_id,
          item.quantity,
          item.price,
          item.size,
          item.color,
          JSON.stringify({ name: item.name, brand: item.brand, image: item.images?.[0] })
        ]
      );

      await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }

    await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);

    await client.query('COMMIT');

    res.status(201).json(order.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Order creation error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  } finally {
    client.release();
  }
});

router.put('/:id/cancel', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;

  try {
    const order = await db.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!['pending', 'confirmed'].includes(order.rows[0].status)) {
      return res.status(400).json({ error: 'Order cannot be cancelled at this stage' });
    }

    const result = await db.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      ['cancelled', req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

router.put('/:id/status', adminMiddleware, async (req, res) => {
  const db = req.app.locals.db;
  const { status, tracking_number } = req.body;

  try {
    const result = await db.query(
      'UPDATE orders SET status = $1, tracking_number = COALESCE($2, tracking_number) WHERE id = $3 RETURNING *',
      [status, tracking_number, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

module.exports = router;
