const fs = require('fs');
const path = 'c:/Users/AjivaInfotech/Documents/GitHub/currency-exchange/server/Modules/transaction/service.js';
let content = fs.readFileSync(path, 'utf8');

// The new methods to add to the TransactionService class in service.js
const newMethods = `
  /**
   * Safely handles deposit processing, ensuring no duplicates and consistency.
   * @param {Object} data Transaction data from blockchain or webhook
   */
  async handleDeposit(data) {
    const { txHash, chain, userId, walletId, amount, block_time } = data;

    if (!txHash || !chain) {
      logger.error("Missing txHash or chain for handleDeposit", { data });
      return null;
    }

    try {
      // 1. Check if transaction already exists (Idempotency)
      let transaction = await Transaction.findOne({ txHash, chain });

      if (transaction) {
        logger.info("Transaction already exists, skipping insert", { txHash, chain });
      } else {
        try {
          // 2. Create Transaction record with block_time
          transaction = await Transaction.create({
            ...data,
            transactionType: "external",
            direction: "incoming",
            status: data.status || "success",
            block_time: block_time || new Date(),
            confirmed_at: block_time || new Date(),
          });
          logger.info("Created new deposit transaction", { txHash, chain, id: transaction._id });
        } catch (dbError) {
          if (dbError.code === 11000) {
            logger.info("Race condition: Duplicate transaction detected during insert, fetching existing", { txHash, chain });
            transaction = await Transaction.findOne({ txHash, chain });
          } else {
            throw dbError;
          }
        }
      }

      // 3. Sync with Deposit model (idempotent)
      let deposit = await Deposit.findOne({ txHash, chain });
      if (!deposit) {
        deposit = await Deposit.create({
          userId: userId || transaction.userId,
          walletId: walletId || transaction.walletId,
          chain,
          network: data.network || "mainnet",
          asset: data.asset || data.currency,
          address: data.toAddress,
          txHash,
          amount,
          status: "confirmed",
          transactionId: transaction._id,
          block_time: transaction.block_time,
          confirmed_at: transaction.confirmed_at,
          metadata: data.metadata || {},
        });
        logger.info("Created new deposit record", { txHash, chain, id: deposit._id });
      } else if (!deposit.transactionId) {
        await Deposit.updateOne({ _id: deposit._id }, { $set: { transactionId: transaction._id } });
      }

      // 4. Emit Real-time event
      socket.emit("deposit_received", {
        txHash,
        chain,
        amount,
        status: "confirmed",
        transactionId: transaction._id
      });

      return { transaction, deposit };
    } catch (error) {
      logger.error("Error handling deposit", { error: error.message, txHash, chain });
      throw error;
    }
  }

  /**
   * Safely handles withdrawal processing, ensuring no duplicates and consistency.
   * @param {Object} data Withdrawal data from system or blockchain
   */
  async handleWithdrawal(data) {
    const { txHash, chain, userId, walletId, amount, block_time } = data;

    if (!txHash || !chain) {
      logger.error("Missing txHash or chain for handleWithdrawal", { data });
      return null;
    }

    try {
      // 1. Check if transaction already exists
      let transaction = await Transaction.findOne({ txHash, chain });

      if (transaction) {
        logger.info("Transaction already exists, updating status", { txHash, chain });
        await Transaction.updateOne(
          { _id: transaction._id },
          { 
            $set: { 
              status: "success", 
              block_time: block_time || transaction.block_time || new Date(),
              confirmed_at: block_time || transaction.confirmed_at || new Date()
            } 
          }
        );
      } else {
        try {
          // 2. Create Transaction record with block_time
          transaction = await Transaction.create({
            ...data,
            transactionType: "external",
            direction: "outgoing",
            status: "success",
            block_time: block_time || new Date(),
            confirmed_at: block_time || new Date(),
          });
          logger.info("Created new withdrawal transaction from blockchain sync", { txHash, chain, id: transaction._id });
        } catch (dbError) {
          if (dbError.code === 11000) {
            transaction = await Transaction.findOne({ txHash, chain });
          } else {
            throw dbError;
          }
        }
      }

      // 3. Sync with Withdrawal model (idempotent)
      let withdrawal = await Withdrawal.findOne({ txHash, chain });
      if (!withdrawal) {
        withdrawal = await Withdrawal.findOne({ transactionId: transaction._id });
      }

      if (!withdrawal) {
        withdrawal = await Withdrawal.create({
          userId: userId || transaction.userId,
          walletId: walletId || transaction.walletId,
          chain,
          network: data.network || "mainnet",
          asset: data.asset || data.currency,
          amount,
          destinationAddress: data.toAddress || data.destinationAddress,
          txHash,
          status: "completed",
          reference: data.reference || \`ext-\${txHash}\`,
          transactionId: transaction._id,
          block_time: transaction.block_time,
          confirmed_at: transaction.confirmed_at,
          metadata: data.metadata || {},
        });
      } else {
        await Withdrawal.updateOne(
          { _id: withdrawal._id },
          {
            $set: {
              status: "completed",
              transactionId: transaction._id,
              block_time: transaction.block_time,
              confirmed_at: transaction.confirmed_at,
              txHash: txHash
            }
          }
        );
      }

      // 4. Emit Real-time success
      socket.emit("transaction_success", {
        txHash,
        chain,
        amount,
        status: "success",
        transactionId: transaction._id
      });

      return { transaction, withdrawal };
    } catch (error) {
      logger.error("Error handling withdrawal confirmation", { error: error.message, txHash, chain });
      throw error;
    }
  }

  /**
   * Emits a pending event for a newly initiated transaction
   * @param {Object} transaction 
   */
  async notifyPending(transaction) {
    socket.emit("transaction_pending", {
      id: transaction._id,
      txHash: transaction.txHash,
      chain: transaction.chain,
      amount: transaction.amount,
      status: "pending"
    });
  }
`;

// Find the last closing brace of the class and insert methods before it
const lastBraceIndex = content.lastIndexOf('}');
// Find the closing brace of the class, not the whole file
// The file ends with module.exports = new TransactionService();
const classEndIndex = content.lastIndexOf('}', content.lastIndexOf('module.exports') - 1);

if (classEndIndex !== -1 && !content.includes('handleDeposit(data)')) {
  content = content.slice(0, classEndIndex) + newMethods + content.slice(classEndIndex);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Successfully merged new methods into service.js');
} else {
    console.log('Methods already exist or could not find class end');
}
