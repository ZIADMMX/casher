// Case documents and their versions.
const { db } = require('../../database/db');

function getDocumentsByCaseId(caseId) {
  return db.prepare(`
    SELECT 
      d.*,
      u.full_name as uploaded_by_name
    FROM case_documents d
    LEFT JOIN users u ON d.uploaded_by = u.id
    WHERE d.case_id = ?
    ORDER BY d.created_at DESC
  `).all(caseId);
}

function createDocument(data) {
  const create = db.transaction(() => {
    const res = db.prepare(`
      INSERT INTO case_documents (
        case_id, title, doc_type, file_path, file_size, version, uploaded_by, notes
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      data.case_id,
      data.title,
      data.doc_type || 'pleading',
      data.file_path,
      data.file_size || null,
      data.uploaded_by || null,
      data.notes || null
    );
    db.prepare(`
      INSERT INTO case_document_versions (document_id, version, file_path, file_size, uploaded_by)
      VALUES (?, 1, ?, ?, ?)
    `).run(res.lastInsertRowid, data.file_path, data.file_size || null, data.uploaded_by || null);
    return res.lastInsertRowid;
  });
  return db.prepare('SELECT * FROM case_documents WHERE id = ?').get(create());
}

function updateDocument(id, data) {
  const columns = {
    title: 'title',
    doc_type: 'doc_type',
    notes: 'notes',
  };
  const update = db.transaction(() => {
    const entries = Object.entries(columns).filter(([key]) => Object.hasOwn(data, key));
    if (entries.length) {
      db.prepare(`UPDATE case_documents SET ${entries.map(([, column]) => `${column} = ?`).join(', ')} WHERE id = ?`)
        .run(...entries.map(([key]) => data[key]), id);
    }
    if (data.versionFile) {
      const current = getDocumentById(id);
      if (!current) return null;
      const version = current.version + 1;
      db.prepare(`
        INSERT INTO case_document_versions (document_id, version, file_path, file_size, uploaded_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, version, data.versionFile.file_path, data.versionFile.file_size, data.versionFile.uploaded_by || null);
      db.prepare(`
        UPDATE case_documents
        SET file_path = ?, file_size = ?, version = ?, uploaded_by = ?
        WHERE id = ?
      `).run(data.versionFile.file_path, data.versionFile.file_size, version,
        data.versionFile.uploaded_by || null, id);
    }
    return getDocumentById(id);
  });
  return update();
}

function deleteDocument(id) {
  const document = db.prepare('SELECT * FROM case_documents WHERE id = ?').get(id);
  if (!document) return { changes: 0, files: [] };
  const files = db.prepare('SELECT file_path FROM case_document_versions WHERE document_id = ?')
    .all(id).map((version) => version.file_path);
  const result = db.prepare('DELETE FROM case_documents WHERE id = ?').run(id);
  return { changes: result.changes, files: files.length ? files : [document.file_path] };
}

function getDocumentById(id) {
  return db.prepare('SELECT * FROM case_documents WHERE id = ?').get(id) || null;
}

function getDocumentVersion(documentId, version) {
  return db.prepare(`
    SELECT * FROM case_document_versions WHERE document_id = ? AND version = ?
  `).get(documentId, version) || null;
}

function getDocumentVersions(documentId) {
  return db.prepare(`
    SELECT * FROM case_document_versions WHERE document_id = ? ORDER BY version DESC
  `).all(documentId);
}

module.exports = {
  getDocumentsByCaseId,
  createDocument,
  updateDocument,
  deleteDocument,
  getDocumentById,
  getDocumentVersion,
  getDocumentVersions,
};
