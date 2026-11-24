// Community Q&A forum routes (modular add-on)
module.exports = function registerForum(app, ctx) {
  const { esc, dbAll, dbGet, dbRun, layout } = ctx;
  const forumNav = '<p style="display:flex;gap:.6rem"><a href="/forum" class="badge" style="font-size:1rem;padding:.4rem 1rem">💬 Forum</a><a href="/forum/new" class="badge" style="font-size:1rem;padding:.4rem 1rem">+ Ask</a></p>';

  app.get('/forum', async (req, res, next) => {
    try {
      const qs = await dbAll(`SELECT q.id, q.title, q.body, q.created_at, u.username, (SELECT COUNT(*) FROM answers wa WHERE wa.q_id=q.id) AS ac
        FROM questions q JOIN users u ON u.id=q.user_id ORDER BY q.id DESC LIMIT 100`);
      const rows = qs.map(q => `
<tr><td><a href="/forum/q/${q.id}">${esc(q.title)}</a><div class="small">${esc(q.body.slice(0, 120))}</div></td>
<td>${esc(q.username)}</td><td>${q.ac}</td><td class="small">${esc((q.created_at || '').slice(0, 10))}</td></tr>`).join('');
      res.send(layout('Community forum', `
${forumNav}
<h2>Community Q&A</h2>
<p class="small">Ask questions, help each other out. Login required to post.</p>
${qs.length ? `<table><tr><th>Topic</th><th>By</th><th>Replies</th><th>Asked</th></tr>${rows}</table>`
  : '<p class="small">No questions yet — be the first!</p>'}`, res.locals.user || null));
    } catch (e) { next(e); }
  });

  app.get('/forum/new', (req, res) => {
    if (!res.locals.user) return res.redirect('/login');
    res.send(layout('New question', `
${forumNav}
<h2>Ask the community</h2>
<form action="/forum/new" method="post">
  <label>Title<input name="title" required maxlength="120"></label>
  <label>Your question<textarea name="body" rows="6" required maxlength="4000"></textarea></label>
  <button>Post question</button>
</form>`, res.locals.user || null));
  });

  app.post('/forum/new', async (req, res, next) => {
    try {
      if (!res.locals.user) return res.redirect('/login');
      const title = String(req.body.title || '').trim().slice(0, 120);
      const body = String(req.body.body || '').trim().slice(0, 4000);
      if (!title || !body) return res.redirect('/forum/new');
      const id = await dbRun('INSERT INTO questions (user_id, title, body) VALUES (?,?,?)', res.locals.user.id, title, body);
      res.redirect('/forum/q/' + id);
    } catch (e) { next(e); }
  });

  app.get('/forum/q/:id', async (req, res, next) => {
    try {
      const q = await dbGet('SELECT q.*, u.username FROM questions q JOIN users u ON u.id=q.user_id WHERE q.id=?', req.params.id);
      if (!q) return res.status(404).send(layout('Not found', '<p>Question not found.</p>', res.locals.user || null));
      const answers = await dbAll('SELECT wa.*, u.username FROM answers wa JOIN users u ON u.id=wa.user_id WHERE wa.q_id=? ORDER BY wa.id', q.id);
      const isQOwner = res.locals.user && res.locals.user.id === q.user_id;
      const isAdmin = res.locals.user && res.locals.user.role === 'admin';
      const answerRows = answers.map(a => {
        const canDel = isAdmin || (res.locals.user && (res.locals.user.id === a.user_id || res.locals.user.id === q.user_id));
        return `<div class="card"><p style="white-space:pre-wrap">${esc(a.body)}</p><p class="small">— ${esc(a.username)}, ${esc((a.created_at || '').slice(0, 10))}${canDel ? ` <form style="display:inline;margin-left:.5rem" action="/forum/post/${a.id}/delete" method="post" onsubmit="return confirm('Delete this reply?')"><button class="ghost" style="font-size:.75rem;padding:.1rem .45rem">✕</button></form>` : ''}</p></div>`;
      }).join('');
      const delQ = (isQOwner || isAdmin) ? ` · <form style="display:inline" action="/forum/q/${q.id}/delete" method="post" onsubmit="return confirm('Delete this question and all replies?')"><button class="ghost" style="font-size:.75rem;padding:.1rem .45rem">Delete question</button></form>` : '';
      res.send(layout(q.title, `
<p><a href="/forum">← Community forum</a></p>
<h2>${esc(q.title)}</h2>
<p class="small">by ${esc(q.username)} · ${esc((q.created_at || '').slice(0, 10))}${delQ}</p>
<p style="white-space:pre-wrap">${esc(q.body)}</p>
<h3>${answers.length} answer(s)</h3>
${answerRows || '<p class="small">No answers yet.</p>'}
${res.locals.user ? `<h3>Your answer</h3><form action="/forum/q/${q.id}/answer" method="post"><textarea name="body" rows="4" required maxlength="4000"></textarea><br><button style="margin-top:.5rem">Post answer</button></form>`
  : '<p class="small"><a href="/login">Log in</a> to answer.</p>'}`, res.locals.user || null));
    } catch (e) { next(e); }
  });

  app.post('/forum/q/:id/answer', async (req, res, next) => {
    try {
      if (!res.locals.user) return res.redirect('/login');
      const q = await dbGet('SELECT id FROM questions WHERE id=?', req.params.id);
      if (!q) return res.sendStatus(404);
      const body = String(req.body.body || '').trim().slice(0, 4000);
      if (body) await dbRun('INSERT INTO answers (q_id, user_id, body) VALUES (?,?,?)', q.id, res.locals.user.id, body);
      res.redirect('/forum/q/' + q.id);
    } catch (e) { next(e); }
  });

  // delete answer: author, question owner or admin
  app.post('/forum/post/:id/delete', async (req, res, next) => {
    try {
      if (!res.locals.user) return res.redirect('/login');
      const a = await dbGet('SELECT wa.*, q.user_id AS q_owner FROM answers wa JOIN questions q ON q.id=wa.q_id WHERE wa.id=?', req.params.id);
      if (!a) return res.sendStatus(404);
      if (res.locals.user.id === a.user_id || res.locals.user.id === a.q_owner || res.locals.user.role === 'admin') {
        await dbRun('DELETE FROM answers WHERE id=?', a.id);
      } else return res.sendStatus(403);
      res.redirect('/forum/q/' + a.q_id);
    } catch (e) { next(e); }
  });

  // delete question + replies: author or admin
  app.post('/forum/q/:id/delete', async (req, res, next) => {
    try {
      if (!res.locals.user) return res.redirect('/login');
      const q = await dbGet('SELECT * FROM questions WHERE id=?', req.params.id);
      if (!q) return res.sendStatus(404);
      if (res.locals.user.id === q.user_id || res.locals.user.role === 'admin') {
        await dbRun('DELETE FROM answers WHERE q_id=?', q.id);
        await dbRun('DELETE FROM questions WHERE id=?', q.id);
        return res.redirect('/forum');
      }
      res.sendStatus(403);
    } catch (e) { next(e); }
  });
};
