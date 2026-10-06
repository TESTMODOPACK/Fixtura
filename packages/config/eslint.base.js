/**
 * Wrapper de resolución: los .eslintrc.cjs extienden
 * '@fixtura/config/eslint.base' y el require de Node NO prueba la
 * extensión .cjs automáticamente — sin este .js el extends nunca
 * resolvió y el lint moría con "couldn't find the config".
 */
module.exports = require('./eslint.base.cjs');
