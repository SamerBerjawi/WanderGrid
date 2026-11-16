'use strict';
const { convertLegacyAllowances } = require('../legacyLeave');

/** Leave plan decision A8: members' old yearly allowance and days taken become an Annual leave allowance and an adjustment. */
module.exports = {
    description: 'turn the old yearly allowance into leave-type allowances',
    async up(client) {
        await convertLegacyAllowances(client);
    },
};
