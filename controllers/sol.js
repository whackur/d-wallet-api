const axios = require('axios');
const {derivePath} = require('ed25519-hd-key');
const {Account} = require('@solana/web3.js');
const bip32 = require('bip32');
const bip39 = require('bip39');
const cwr = require('../utils/createWebResp');

const toSOL = (value) => {
  return value / 10 ** 9;
};
const fromSOL = (value) => {
  return value * 10 ** 9;
};

const getBalance = async (req, res) => {
  try {
    const {address} = req.query;
    const url = req.endpoint;
    const result = await axios.post(url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [address],
    });
    const balance = toSOL(result?.data?.result?.value);
    return cwr.createWebResp(res, 200, {balance, UNIT: 'SOL'});
  } catch (e) {
    return cwr.errorWebResp(res, 500, 'E0000 - getBalance', e.message);
  }
};

const getTokenBalance = async (req, res) => {
  try {
    const {address, mint, programId} = req.query;
    if (mint && programId) {
      return cwr.errorWebResp(
        res,
        500,
        'E0000 - getTokenBalance',
        'Do not input mint AND programId. input one(mint OR programId)',
      );
    }
    if (!(mint || programId)) {
      return cwr.errorWebResp(
        res,
        500,
        'E0000 - getTokenBalance',
        'empty input. please input mint or programId',
      );
    }

    const url = req.web3.clusterApiUrl(req.network);
    const options = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenAccountsByOwner',
      params: [
        address,
        {
          programId,
          mint,
        },
        {
          encoding: 'jsonParsed',
        },
      ],
    };
    const result = await axios.post(url, options);
    const rawData = result?.data?.result?.value;
    const token = [];
    if (rawData) {
      for (const i in rawData) {
        const amount =
          rawData[i]?.account?.data?.parsed?.info?.tokenAmount?.amount;
        const decimals =
          rawData[i]?.account?.data?.parsed?.info?.tokenAmount?.decimals;
        const balance = amount / 10 ** decimals;
        const pubkey = rawData[i]?.pubkey;
        const mint = rawData[i]?.account?.data?.parsed?.info?.mint;
        token.push({
          pubkey,
          balance,
          amount,
          decimals,
          mint,
        });
      }
    } else {
      return cwr.errorWebResp(
        res,
        500,
        'E0000 - getTokenBalance',
        'failed axios',
      );
    }
    return cwr.createWebResp(res, 200, {token, rawData});
  } catch (e) {
    return cwr.errorWebResp(res, 500, 'E0000 - getTokenBalance', e.message);
  }
};

const getBlock = async (req, res) => {
  try {
    const {blockNumber} = req.query;
    const {connection} = req;
    const block = await connection.getBlock(Number(blockNumber));
    return cwr.createWebResp(res, 200, {blockNumber, block});
  } catch (e) {
    return cwr.errorWebResp(res, 500, 'E0000 - getBlock', e.message);
  }
};

const getTransaction = async (req, res) => {
  try {
    const {txNumber} = req.query;
    const tx = await req.connection.getTransaction(txNumber);
    return cwr.createWebResp(res, 200, {txNumber, tx});
  } catch (e) {
    return cwr.errorWebResp(res, 500, 'E0000 - getTransaction', e.message);
  }
};

const postAirdropFromAddress = async (req, res) => {
  try {
    const {address, value} = req.query;
    const url = req.web3.clusterApiUrl(req.network);
    const options = {
      jsonrpc: '2.0',
      id: 1,
      method: 'requestAirdrop',
      params: [address, Number(value)],
    };
    const result = await axios.post(url, options);
    const data = result?.data;
    return cwr.createWebResp(res, 200, {data});
  } catch (e) {
    return cwr.errorWebResp(
      res,
      500,
      'E0000 - postAirdropFromAddress',
      e.message,
    );
  }
};

const postDecodeMnemonic = async (req, res) => {
  try {
    const {mnemonic, index} = req.body;
    const path = `m/44'/501'/${index}'`;
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const hexSeed = Buffer.from(seed).toString('hex');
    const derivedSeed = derivePath(path, hexSeed).key;
    const account = new Account(
      req.web3.Keypair.fromSeed(derivedSeed).secretKey,
    );
    const publicKey = account.publicKey.toString();
    const secretKey = account.secretKey.toString('hex');
    const form = {
      path,
      account: publicKey,
      secretKey,
      seed: Buffer.from(seed).toString('hex'),
    };
    const keyPair = req.web3.Keypair.fromSeed(seed.slice(0, 32));
    const solletWallet = {
      publicKey: keyPair.publicKey.toString(),
      privateKey: keyPair.secretKey.toString(),
    };
    return cwr.createWebResp(res, 200, {form, solletWallet});
  } catch (e) {
    return cwr.errorWebResp(res, 500, `E0000 - postDecodeMnemonic`, e.message);
  }
};

const postSend = async (req, res) => {
  try {
    const {fromMnemonic, toAddress, balance} = req.body;
    const seed = bip39.mnemonicToSeedSync(fromMnemonic);
    const from = req.web3.Keypair.fromSeed(seed.slice(0, 32));
    const to = new req.web3.PublicKey(toAddress);
    const transaction = new req.web3.Transaction().add(
      req.web3.SystemProgram.transfer({
        fromPubkey: from.publicKey,
        toPubkey: to,
        lamports: fromSOL(balance),
      }),
    );
    const signature = await req.web3.sendAndConfirmTransaction(
      req.connection,
      transaction,
      [from],
    );
    const tx = await req.connection.getTransaction(signature);
    return cwr.createWebResp(res, 200, {signature, tx});
  } catch (e) {
    return cwr.errorWebResp(res, 500, `E0000 - postSendSol`, e.message);
  }
};

module.exports = {
  getBalance,
  getTokenBalance,
  getBlock,
  getTransaction,
  postDecodeMnemonic,
  postAirdropFromAddress,
  postSend,
};
