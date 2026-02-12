const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json({limit:'1mb'}));

// Simple in-memory store for demo purposes
const db = { users: {}, watchlists: {} };

app.use(express.static(path.join(__dirname, '..')));

app.post('/api/sync-watchlist', (req, res)=>{
  // req.body can be {action:'add'|'remove'|'clear'|'sync', item?, id?}
  console.log('sync-watchlist received', req.body);
  // For demo: accept and reply ok
  return res.json({ok:true});
});

app.get('/api/search', (req, res)=>{
  // naive search over sample data
  try{
    const q = (req.query.q||'').toLowerCase();
    const data = require('../data/movies.sample.json');
    if (!q) return res.json(data.slice(0,50));
    const out = data.filter(d=> (d.title||'').toLowerCase().includes(q) || (d.overview||'').toLowerCase().includes(q));
    return res.json(out.slice(0,50));
  }catch(e){ res.status(500).json({error:'search failed'}); }
});

const port = process.env.PORT || 3000;
app.listen(port, ()=>console.log('Dev server running on http://localhost:'+port));
