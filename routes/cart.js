const express = require('express');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/cart
router.get('/', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;

  try {
    const result = await db.query(
      `SELECT ci.*, p.name, p.brand, p.price, p.images, p.stock
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.user_id = $1
       ORDER BY ci.created_at DESC`,
      [req.user.id]
    );

    const total = result.rows.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    res.json({ items: result.rows, total });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// POST /api/cart - add item
router.post('/', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;
  const { product_id, quantity = 1, size, color } = req.body;

  if (!product_id) {
    return res.status(400).json({ error: 'product_id is required' });
  }

  try {
    // Check product exists and has stock
    const product = await db.query('SELECT * FROM products WHERE id = $1', [product_id]);
    if (product.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.rows[0].stock < quantity) {
      return res.status(400).json({ error: 'Not enough stock' });
    }

    // Upsert cart item
    const result = await db.query(
      `INSERT INTO cart_items (user_id, product_id, quantity, size, color)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, product_id, size, color)
       DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
       RETURNING *`,
      [req.user.id, product_id, quantity, size || null, color || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Cart add error:', err);
    res.status(500).json({ error: 'Failed to add to cart' });
  }
});

// PUT /api/cart/:id - update quantity
router.put('/:id', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;
  const { quantity } = req.body;

  if (!quantity || quantity < 1) {
    return res.status(400).json({ error: 'Quantity must be at least 1' });
  }

  try {
    const result = await db.query(
      'UPDATE cart_items SET quantity = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [quantity, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update cart item' });
  }
});

// DELETE /api/cart/:id - remove item
router.delete('/:id', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;

  try {
    await db.query(
      'DELETE FROM cart_items WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove cart item' });
  }
});

// DELETE /api/cart - clear cart
router.delete('/', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;

  try {
    await db.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

module.exports = router;
