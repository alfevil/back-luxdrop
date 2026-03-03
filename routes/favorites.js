const express = require('express');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      `SELECT f.id, f.created_at, p.* FROM favorites f JOIN products p ON f.product_id = p.id WHERE f.user_id = $1`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

router.post('/:productId', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query(
      'INSERT INTO favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, req.params.productId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

router.delete('/:productId', authMiddleware, async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query(
      'DELETE FROM favorites WHERE user_id = $1 AND product_id = $2',
      [req.user.id, req.params.productId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

module.exports = router;
