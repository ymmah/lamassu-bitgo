const _ = require('lodash')
const BitGo = require('bitgo')
const pjson = require('./package.json')
const userAgent = 'Lamassu-BitGo/' + pjson.version

const NAME = 'BitGo'
const SUPPORTED_MODULES = ['wallet']

let bitgo
const pluginConfig = {}

function getWallet () {
  return bitgo.wallets().get({ id: pluginConfig.walletId })
}

function config (localConfig) {
  if (localConfig) {
    _.merge(pluginConfig, localConfig)
  }
  if (pluginConfig.token && pluginConfig.walletId && pluginConfig.walletPassphrase) {
    bitgo = new BitGo.BitGo({ accessToken: pluginConfig.token, env: 'prod', userAgent: userAgent })
  } else {
    throw new Error('BitGo config requires token and walletId')
  }
}

function sendCoins (address, satoshis, fee) {
  return getWallet()
  .then(wallet => {
    const params = {
      address: address,
      amount: satoshis,
      // fee: fee,  // TODO: support fee in sendCoins
      walletPassphrase: pluginConfig.walletPassphrase
    }
    return wallet.sendCoins(params)
  })
  .then(result => {
    return result.hash
  })
  .catch(err => {
    if (err.message === 'Insufficient funds') {
      err.name = 'InsufficientFunds'
    }
    throw err
  })
}

function balance () {
  return getWallet()
  .then(wallet => {
    return {
      BTC: wallet.wallet.spendableConfirmedBalance
    }
  })
}

function newAddress (info) {
  return getWallet()
  .then(wallet => {
    return wallet.createAddress()
    .then(result => {
      const address = result.address

      // If a label was provided, set the label
      if (info.label) {
        return wallet.setLabel({ address: address, label: info.label })
        .then(() => address)
      }

      return address
    })
  })
}

function getStatus (toAddress, requested) {
  return bitgo.blockchain().getAddress({address: toAddress})
  .then(rec => {
    if (rec.balance === 0) return {status: 'notSeen'}
    if (rec.balance < requested) return {status: 'insufficientFunds'}
    if (rec.confirmedBalance < requested) return {status: 'authorized'}
    return {status: 'confirmed'}
  })
}

module.exports = {
  NAME,
  SUPPORTED_MODULES,
  config,
  balance,
  sendCoins,
  newAddress,
  getStatus
}
