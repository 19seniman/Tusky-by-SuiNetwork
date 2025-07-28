const axios = require('axios');

const dotenv = require('dotenv');

const readline = require('readline');

const fs = require('fs');

const { HttpsProxyAgent } = require('https-proxy-agent');

const { SuiClient, getFullnodeUrl } = require('@mysten/sui.js/client');

const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');

const { decodeSuiPrivateKey } = require('@mysten/sui.js/cryptography');



dotenv.config();



const colors = {

    reset: "\x1b[0m",

    cyan: "\x1b[36m",

    green: "\x1b[32m",

    yellow: "\x1b[33m",

    red: "\x1b[31m",

    white: "\x1b[37m",

    bold: "\x1b[1m",

    magenta: "\x1b[35m",

    blue: "\x1b[34m",

    gray: "\x1b[90m",

};



const logger = {

    info: (msg) => console.log(`${colors.cyan}[i] ${msg}${colors.reset}`),

    warn: (msg) => console.log(`${colors.yellow}[!] ${msg}${colors.reset}`),

    error: (msg) => console.log(`${colors.red}[x] ${msg}${colors.reset}`),

    success: (msg) => console.log(`${colors.green}[+] ${msg}${colors.reset}`),

    loading: (msg) => console.log(`${colors.magenta}[*] ${msg}${colors.reset}`),

    step: (msg) => console.log(`${colors.blue}[>] ${colors.bold}${msg}${colors.reset}`),

    critical: (msg) => console.log(`${colors.red}${colors.bold}[FATAL] ${msg}${colors.reset}`),

    summary: (msg) => console.log(`${colors.green}${colors.bold}[SUMMARY] ${msg}${colors.reset}`),

    banner: () => {

        const border = `${colors.blue}${colors.bold}╔═════════════════════════════════════════╗${colors.reset}`;

        const title = `${colors.blue}${colors.bold}║   🍉 19Seniman From Insider   🍉   ║${colors.reset}`;

        const bottomBorder = `${colors.blue}${colors.bold}╚═════════════════════════════════════════╝${colors.reset}`;



        console.log(`\n${border}`);

        console.log(`${title}`);

        console.log(`${bottomBorder}\n`);

    },

    section: (msg) => {

        const line = '─'.repeat(40);

        console.log(`\n${colors.gray}${line}${colors.reset}`);

        if (msg) console.log(`${colors.white}${colors.bold} ${msg}${colors.reset}`);

        console.log(`${colors.gray}${line}${colors.reset}\n`);

    },

    countdown: (msg) => process.stdout.write(`\r${colors.blue}[⏰] ${msg}${colors.reset}`),

};



const generateRandomUserAgent = () => {

    const browsers = ['Brave', 'Chrome', 'Firefox', 'Safari'];

    const platforms = ['Windows', 'Macintosh', 'Linux'];

    const versions = ['138', '139', '140'];

    const browser = browsers[Math.floor(Math.random() * browsers.length)];

    const platform = platforms[Math.floor(Math.random() * platforms.length)];

    const version = versions[Math.floor(Math.random() * versions.length)];

    return `"Not)A;Brand";v="8", "Chromium";v="${version}", "${browser}";v="${version}"`;

};



// --- URL API dan Referer Baru ---

const BASE_API_URL = 'https://dev-api.tusky.io/';

const REFERER_URL = 'https://devnet.app.tusky.io/';

// --- Endpoint Upload Baru ---

const UPLOAD_API_URL = 'https://api.tusky.io/uploads'; // Endpoint upload yang diminta

// --- Akhir URL Baru ---



const getCommonHeaders = (authToken = null) => ({

    accept: 'application/json, text/plain, */*',

    'accept-language': 'en-US,en;q=0.8',

    'content-type': 'application/json',

    'client-name': 'Tusky-App/dev',

    priority: 'u=1, i',

    'sdk-version': 'Tusky-SDK/0.31.0',

    'sec-ch-ua': generateRandomUserAgent(),

    'sec-ch-ua-mobile': '?0',

    'sec-ch-ua-platform': '"Windows"',

    'sec-fetch-dest': 'empty',

    'sec-fetch-mode': 'cors',

    'sec-fetch-site': 'same-site',

    'sec-gpc': '1',

    Referer: REFERER_URL,

    ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),

});



// Fungsi untuk header upload, dikembalikan lagi

const getUploadHeaders = (idToken, fileSize, uploadMetadata) => ({

    accept: 'application/json, text/plain, */*',

    'accept-language': 'en-US,en;q=0.8',

    'content-type': 'application/offset+octet-stream', // Penting untuk TUS

    'tus-resumable': '1.0.0', // Penting untuk TUS

    'upload-length': fileSize.toString(), // Penting untuk TUS

    'upload-metadata': Object.entries(uploadMetadata)

        .map(([k, v]) => {

            // Encode value if it's vaultId, parentId, name, type, filetype, filename

            if (['vaultId', 'parentId', 'name', 'type', 'filetype', 'filename'].includes(k)) {

                // Pastikan nilai adalah string sebelum di-encode

                return `${k} ${Buffer.from(String(v)).toString('base64')}`;

            }

            return `${k} ${v}`; // Biarkan nilai lain seperti adanya

        })

        .join(','),

    Referer: REFERER_URL,

    ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),

});



const loadProxies = () => {

    try {

        const proxies = fs.readFileSync('proxies.txt', 'utf8')

            .split('\n')

            .map(line => line.trim())

            .filter(line => line && !line.startsWith('#'));

        logger.info(`Loaded ${proxies.length} proxies from proxies.txt`);

        return proxies;

    } catch (error) {

        logger.warn('No proxies found in proxies.txt or file does not exist. Using direct mode.');

        return [];

    }

};



const createAxiosInstance = (proxyUrl = null) => {

    if (proxyUrl) {

        try {

            logger.info(`Using proxy: ${proxyUrl}`);

            return axios.create({

                httpsAgent: new HttpsProxyAgent(proxyUrl),

            });

        } catch (error) {

            logger.warn(`Invalid proxy format: ${proxyUrl}. Falling back to direct mode.`);

            return axios.create();

        }

    }

    logger.info('Using direct mode (no proxy)');

    return axios.create();

};



const isValidUUID = (str) => {

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    return uuidRegex.test(str);

};



const loginWallet = async (account) => {

    logger.step(`Starting wallet login process for account ${account.index} (${account.type})`);

    try {

        const client = new SuiClient({ url: getFullnodeUrl('mainnet') });

        let keypair;

        if (account.mnemonic) {

            logger.info(`Processing mnemonic for account ${account.index}`);

            try {

                keypair = Ed25519Keypair.deriveKeypair(account.mnemonic, "m/44'/784'/0'/0'/0'");

            } catch (e) {

                throw new Error(`Invalid mnemonic for account ${account.index}: ${e.message}`);

            }

        } else if (account.privateKey) {

            logger.info(`Processing private key for account ${account.index}: ${account.privateKey.slice(0, 15)}...`);

            const { secretKey } = decodeSuiPrivateKey(account.privateKey);

            if (secretKey.length !== 32) {

                throw new Error(`Wrong secretKey size. Expected 32 bytes, got ${secretKey.length}`);

            }

            keypair = Ed25519Keypair.fromSecretKey(secretKey);

        } else {

            throw new Error(`No valid private key or mnemonic for account ${account.index}`);

        }



        const address = keypair.getPublicKey().toSuiAddress();

        logger.info(`Processing address: ${address}`);



        const challengeResponse = await axios.post(

            `${BASE_API_URL}auth/create-challenge?`,

            { address },

            { headers: getCommonHeaders() }

        );



        const nonce = challengeResponse.data.nonce;

        const message = `tusky:connect:${nonce}`;

        logger.info(`Signing message: ${message}`);



        const messageBytes = new TextEncoder().encode(message);

        const signatureData = await keypair.signPersonalMessage(messageBytes);

        const signature = signatureData.signature;

        logger.info(`Generated signature: ${signature}`);



        const verifyResponse = await axios.post(

            `${BASE_API_URL}auth/verify-challenge?`,

            { address, signature },

            { headers: getCommonHeaders() }

        );



        const idToken = verifyResponse.data.idToken;

        logger.success(`Successfully logged in for address ${address}`);



        fs.appendFileSync('tokens.txt', `${idToken}\n`);

        logger.info(`Token saved to tokens.txt`);



        return { idToken, address, accountIndex: account.index, privateKey: account.privateKey, mnemonic: account.mnemonic, type: account.type };

    } catch (error) {

        logger.error(`Failed to login for account ${account.index} (${account.type}): ${error.message}`);

        if (error.response) {

            logger.error(`API response: ${JSON.stringify(error.response.data)}`);

        }

        return null;

    }

};



const fetchStorageInfo = async (idToken, axiosInstance, account) => {

    logger.step(`Fetching storage information for account ${account.accountIndex}`);

    try {

        const response = await axiosInstance.get(`${BASE_API_URL}storage?`, {

            headers: {

                ...getCommonHeaders(idToken),

                'client-name': 'Tusky-App/dev',

            },

        });

        const { storageAvailable, storageTotal, photos, owner } = response.data;

        logger.info(`Storage Available: ${storageAvailable} bytes (~${(storageAvailable / 1000000).toFixed(2)} MB)`);

        logger.info(`Storage Total: ${storageTotal} bytes (~${(storageTotal / 1000000).toFixed(2)} MB)`);

        logger.info(`Photos Size: ${photos} bytes`);

        logger.info(`Owner: ${owner}`);

        return { storageAvailable, storageTotal, photos, owner };

    } catch (error) {

        if (error.response && error.response.status === 401) {

            logger.warn(`Token expired for account ${account.accountIndex}. Attempting to refresh token...`);

            const newToken = await loginWallet({

                privateKey: account.privateKey,

                mnemonic: account.mnemonic,

                index: account.accountIndex,

                type: account.type,

            });

            if (newToken) {

                account.idToken = newToken.idToken;

                logger.success(`Token refreshed for account ${account.accountIndex}`);

                return await fetchStorageInfo(account.idToken, axiosInstance, account);

            } else {

                logger.error(`Failed to refresh token for account ${account.accountIndex}`);

                throw new Error('Token refresh failed');

            }

        }

        logger.error(`Failed to fetch storage info for account ${account.accountIndex}: ${error.message}`);

        if (error.response) {

            logger.error(`API response: ${JSON.stringify(error.response.data)}`);

        }

        throw error;

    }

};



const generateRandomVaultName = () => {

    const adjectives = ['Cosmic', 'Stellar', 'Lunar', 'Solar', 'Nebula', 'Galactic', 'Orbit', 'Astro'];

    const nouns = ['Vault', 'Storage', 'Chamber', 'Node', 'Hub', 'Cluster', 'Zone', 'Realm'];

    const randomNum = Math.floor(Math.random() * 1000);

    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}-${nouns[Math.floor(Math.random() * nouns.length)]}-${randomNum}`;

};



const createPublicVault = async (idToken, axiosInstance, account) => {

    logger.step(`Creating new public vault for account ${account.accountIndex}`);

    try {

        const vaultName = generateRandomVaultName();

        const vaultData = {

            name: vaultName,

            encrypted: false,

            tags: []

        };



        const response = await axiosInstance.post(`${BASE_API_URL}vaults?`, vaultData, {

            headers: {

                ...getCommonHeaders(idToken),

                'client-name': 'Tusky-App/dev',

            },

        });



        const vault = response.data;

        logger.success(`Created new public vault: "${vault.name}" (${vault.id})`);



        return {

            id: vault.id,

            name: vault.name,

            rootFolderId: vault.id,

            size: vault.size || 0,

            owner: vault.owner

        };

    } catch (error) {

        if (error.response && error.response.status === 401) {

            logger.warn(`Token expired for account ${account.accountIndex}. Attempting to refresh token...`);

            const newToken = await loginWallet({

                privateKey: account.privateKey,

                mnemonic: account.mnemonic,

                index: account.accountIndex,

                type: account.type,

            });

            if (newToken) {

                account.idToken = newToken.idToken;

                logger.success(`Token refreshed for account ${account.accountIndex}`);

                return await createPublicVault(account.idToken, axiosInstance, account);

            } else {

                logger.error(`Failed to refresh token for account ${account.accountIndex}`);

                throw new Error('Token refresh failed');

            }

        }

        logger.error(`Failed to create vault for account ${account.accountIndex}: ${error.message}`);

        if (error.response) {

            logger.error(`API response: ${JSON.stringify(error.response.data)}`);

        }

        throw error;

    }

};



const uploadFile = async (idToken, vault, axiosInstance, account) => {

    logger.step(`Uploading file to vault "${vault.name}" (${vault.id}) for account ${account.accountIndex}`);

    try {

        if (!isValidUUID(vault.id) || !isValidUUID(vault.rootFolderId)) {

            logger.error(`Invalid vaultId or rootFolderId format: vaultId=${vault.id}, rootFolderId=${vault.rootFolderId}`);

            throw new Error('Invalid UUID format');

        }



        const imageResponse = await axios.get('https://picsum.photos/800/600', { responseType: 'arraybuffer' });

        const imageBuffer = Buffer.from(imageResponse.data);

        const fileName = `image_${Date.now()}.jpg`;

        const fileSize = imageBuffer.length;

        const mimeType = 'image/jpeg';



        const uploadMetadata = {

            vaultId: vault.id,

            parentId: vault.rootFolderId,

            relativePath: 'null', // 'null' string, tidak perlu di-base64 jika tidak ada path

            name: fileName,

            type: mimeType,

            filetype: mimeType,

            filename: fileName,

        };



        const uploadHeaders = getUploadHeaders(idToken, fileSize, uploadMetadata);



        const uploadParams = {

            vaultId: vault.id, // Parameter ini mungkin dibutuhkan oleh endpoint

        };



        // --- Perubahan: Menggunakan UPLOAD_API_URL yang baru ---

        const uploadResponse = await axiosInstance.post(UPLOAD_API_URL, imageBuffer, {

            headers: uploadHeaders,

            params: uploadParams, // Sertakan params jika diperlukan oleh endpoint

        });



        const uploadId = uploadResponse.data.uploadId; // Asumsi respons memiliki uploadId

        logger.success(`File uploaded to vault "${vault.name}", Upload ID: ${uploadId}`);

        logger.info(`File details: ${fileName} (${(fileSize / 1000000).toFixed(2)} MB)`);



        return uploadId;

    } catch (error) {

        if (error.response && error.response.status === 401) {

            logger.warn(`Token expired for account ${account.accountIndex}. Attempting to refresh token...`);

            const newToken = await loginWallet({

                privateKey: account.privateKey,

                mnemonic: account.mnemonic,

                index: account.accountIndex,

                type: account.type,

            });

            if (newToken) {

                account.idToken = newToken.idToken;

                logger.success(`Token refreshed for account ${account.accountIndex}`);

                return await uploadFile(account.idToken, vault, axiosInstance, account);

            } else {

                logger.error(`Failed to refresh token for account ${account.accountIndex}`);

                throw new Error('Token refresh failed');

            }

        }

        logger.error(`Failed to upload file to vault "${vault.name}" for account ${account.accountIndex}: ${error.message}`);

        if (error.response) {

            logger.error(`API response: ${JSON.stringify(error.response.data)}`);

        }

        throw error;

    }

};



const countdown = (seconds) => {

    return new Promise((resolve) => {

        const interval = setInterval(() => {

            const hours = Math.floor(seconds / 3600);

            const minutes = Math.floor((seconds % 3600) / 60);

            const secs = seconds % 60;

            logger.countdown(`${hours}h ${minutes}m ${secs}s`);

            seconds--;

            if (seconds < 0) {

                clearInterval(interval);

                process.stdout.write('\n');

                resolve();

            }

        }, 1000);

    });

};



const rl = readline.createInterface({

    input: process.stdin,

    output: process.stdout,

});



const runUploads = async (numberOfUploads, account, proxyUrl) => {

    logger.section(`Starting Uploads for Account ${account.accountIndex}`);

    try {

        const idToken = account.idToken;

        logger.step(`Using token for address ${account.address}: ${idToken.slice(0, 20)}...`);



        const axiosInstance = createAxiosInstance(proxyUrl);



        await fetchStorageInfo(idToken, axiosInstance, account);



        const vault = await createPublicVault(idToken, axiosInstance, account);

        logger.info(`Using newly created vault: "${vault.name}" (${vault.id})`);



        for (let i = 0; i < numberOfUploads; i++) {

            logger.step(`Upload ${i + 1} of ${numberOfUploads} to vault "${vault.name}"`);

            await uploadFile(idToken, vault, axiosInstance, account);

            logger.success(`Upload ${i + 1} completed for account ${account.accountIndex}`);



            if (i < numberOfUploads - 1) {

                await new Promise(resolve => setTimeout(resolve, 2000));

            }

        }



        logger.summary(`All ${numberOfUploads} uploads completed for account ${account.accountIndex}`);

    } catch (error) {

        logger.error(`Error processing uploads for account ${account.accountIndex}: ${error.message}`);

        if (error.response) {

            logger.error(`API response: ${JSON.stringify(error.response.data)}`);

        }

    }

};



const main = async () => {

    logger.banner();



    const numberOfUploads = await new Promise((resolve) => {

        rl.question('Enter the number of uploads to perform daily: ', (answer) => {

            resolve(parseInt(answer, 10) || 1);

        });

    });

    logger.info(`Will perform ${numberOfUploads} uploads daily`);



    const proxies = loadProxies();

    let proxyIndex = 0;



    while (true) {

        const accounts = [];

        let i = 1;

        while (true) {

            const privateKey = process.env[`PRIVATE_KEY_${i}`];

            const mnemonic = process.env[`MNEMONIC_${i}`];

            if (!privateKey && !mnemonic) {

                break;

            }

            if (privateKey) {

                accounts.push({ privateKey, mnemonic: null, index: accounts.length + 1, type: 'privateKey' });

            }

            if (mnemonic) {

                accounts.push({ privateKey: null, mnemonic, index: accounts.length + 1, type: 'mnemonic' });

            }

            i++;

        }



        if (accounts.length === 0) {

            logger.critical('No valid private keys or mnemonics found in .env file');

            break;

        }



        logger.info(`Found ${accounts.length} accounts to process`);

        logger.info(`Loaded accounts: ${JSON.stringify(accounts.map(a => ({

            index: a.index,

            type: a.type,

            hasPrivateKey: !!a.privateKey,

            hasMnemonic: !!a.mnemonic

        })))}`);



        for (const account of accounts) {

            logger.section(`Processing account ${account.index} (${account.type})`);

            const loggedInAccount = await loginWallet(account);

            if (loggedInAccount) {

                const proxyUrl = proxies.length > 0 ? proxies[proxyIndex % proxies.length] : null;

                proxyIndex++;

                await runUploads(numberOfUploads, loggedInAccount, proxyUrl);

            } else {

                logger.error(`Skipping account ${account.index} (${account.type}) due to login failure`);

            }

        }



        logger.summary('Daily upload session completed for all accounts');

        const nextRun = new Date(Date.now() + 24 * 60 * 60 * 1000);

        logger.info(`Next run scheduled at: ${nextRun.toLocaleString('en-US', { timeZone: 'Asia/Makassar' })}`);

        await countdown(24 * 60 * 60);

    }



    rl.close();

};



main().catch((error) => {

    logger.critical(`Fatal error: ${error.message}`);

    rl.close();

});
