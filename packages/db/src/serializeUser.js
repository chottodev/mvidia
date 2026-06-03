/** @param {import('mongoose').Document | import('mongoose').LeanDocument<any>} doc */
function serializeUser(doc) {
  return {
    id: String(doc._id),
    phone: doc.phone,
    name: doc.name,
    createdAt: doc.createdAt,
  };
}

module.exports = { serializeUser };
