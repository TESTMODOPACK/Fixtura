/**
 * ESLint normaliza el extends '@fixtura/config/eslint.base' al paquete
 * '@fixtura/eslint-config-config' (convención de shareable configs:
 * @scope/nombre → @scope/eslint-config-nombre). Este archivo solo
 * reexporta la config canónica — las reglas viven en @fixtura/config.
 */
module.exports = require('@fixtura/config/eslint.base.cjs');
