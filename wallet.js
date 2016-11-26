const BitGo = require('bitgo')
const pjson = require('./package.json')
const userAgent = 'Lamassu-BitGo/' + pjson.version

const NAME = 'BitGo'

function buildBitgo (account) {
  return new BitGo.BitGo({accessToken: account.token, env: 'prod', userAgent: userAgent})
}

function getWallet (account) {
  const bitgo = buildBitgo(account)
  return bitgo.wallets().get({ id: account.walletId })
}

function sendCoins (account, address, satoshis, fee) {
  return getWallet(account)
  .then(wallet => {
    const params = {
      address: address,
      amount: satoshis,
      walletPassphrase: account.walletPassphrase
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

function balance (account) {
  return getWallet(account)
  .then(wallet => {
    return {
      BTC: wallet.wallet.spendableConfirmedBalance
    }
  })
}

function newAddress (account, info) {
  return getWallet(account)
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

function getStatus (account, toAddress, requested) {
  const bitgo = buildBitgo(account)
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
  balance,
  sendCoins,
  newAddress,
  getStatus
}
