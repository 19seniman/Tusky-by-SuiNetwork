const axios = require('axios');
const dotenv = require('dotenv');
const readline = require('readline');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');

dotenv.config();

const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    white: "\x1b[37m",
    bold: "\x1b[1m"
};

const logger = {
    info: (msg) => console.log(`${colors.green}[✓] ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}[⚠] ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}[✗] ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}[✅] ${msg}${colors.reset}`),
    loading: (msg) => console.log(`${colors.cyan}[⟳] ${msg}${colors.reset}`),
    step: (msg) => console.log(`${colors.white}[➤] ${msg}${colors.reset}`),
    banner: () => {
        console.log(`${colors.cyan}${colors.bold}`);
        console.log(`---------------------------------------------`);
        console.log(`   🍉🍉 19Seniman From Insider 🍉🍉  `);
        console.log(`---------------------------------------------${colors.reset}`);
        console.log();
    }
};

const DEFAULT_IMAGE_URL = 'https://picsum.photos/800/600';

const generateRandomUserAgent = () => {
    const browsers = ['Brave', 'Chrome', 'Firefox', 'Safari'];
    const platforms = ['Windows', 'Macintosh', 'Linux'];
    const versions = ['138', '139', '140'];
    const browser = browsers[Math.floor(Math.random() * browsers.length)];
    const platform = platforms[Math.floor(Math.random() * platforms.length)];
    const version = versions[Math.floor(Math.random() * versions.length)];
    return `"Not)A;Brand";v="8", "Chromium";v="${version}", "${browser}";v="${version}"`;
};

const getCommonHeaders = (authToken = null) => ({
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
    'priority': 'u=1, i',
    'sdk-version': 'Tusky-SDK/0.31.0',
    'sec-ch-ua': generateRandomUserAgent(),
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'sec-gpc': '1',
    'Referer': 'https://testnet.app.tusky.io/', // Pastikan ini sesuai dengan domain Tusky Anda
    ...(authToken ? { 'authorization': `Bearer ${authToken}` } : {}),
    'client-name': 'Tusky-App/dev'
});

// --- Endpoint Upload yang Diminta ---
const UPLOAD_API_URL = 'https://api.tusky.io/uploads'; 
// --- Akhir Endpoint Upload ---

// Fungsi untuk header upload, dikembalikan lagi
const getUploadHeaders = (idToken, fileSize, uploadMetadata) => ({
    ...getCommonHeaders(idToken), // Mengambil header umum dan menambahkan atau menimpa yang spesifik
    'content-type': 'application/offset+octet-stream', // Penting untuk TUS
    'tus-resumable': '1.0.0', // Penting untuk TUS
    'upload-length': fileSize.toString(), // Penting untuk TUS
    // Menggunakan Object.entries dan map untuk format upload-metadata dengan base64 encoding
    'upload-metadata': Object.entries(uploadMetadata)
        .map(([k, v]) => {
            // Encode value if it's vaultId, parentId, name, type, filetype, filename
            // Pastikan nilai adalah string sebelum di-encode
            return `${k} ${Buffer.from(String(v)).toString('base64')}`;
        })
        .join(',')
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
                httpsAgent: new HttpsProxyAgent(proxyUrl)
            });
        } catch (error) {
            logger.warn(`Invalid proxy format: ${proxyUrl}. Falling back to direct mode.`);
            return axios.create();
        }
    }
    logger.info('Using direct mode (no proxy)');
    return axios.create();
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const loadTokens = () => {
    const tokens = [];
    let i = 1;
    while (process.env[`token_${i}`]) {
        const token = process.env[`token_${i}`];
        if (token) {
            logger.info(`Loaded token ${i}: ${token.slice(0, 20)}...`);
            tokens.push({ idToken: token });
        } else {
            logger.error(`Invalid token for token_${i}`);
        }
        i++;
    }
    return tokens;
};

const fetchStorageInfo = async (idToken, axiosInstance) => {
    logger.step(`Fetching storage information`);
    try {
        const response = await axiosInstance.get('https://dev-api.tusky.io/storage?', {
            headers: getCommonHeaders(idToken)
        });
        const { storageAvailable, storageTotal } = response.data;
        logger.info(`Storage Available: ${storageAvailable} bytes (~${(storageAvailable / 1000000).toFixed(2)} MB)`);
        logger.info(`Storage Total: ${storageTotal} bytes (~${(storageTotal / 1000000).toFixed(2)} MB)`);
        return { storageAvailable, storageTotal };
    } catch (error) {
        logger.error(`Failed to fetch storage info: ${error.message}`);
        if (error.response) {
            logger.error(`API response: ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
};

const fetchVaults = async (idToken, axiosInstance) => {
    logger.step(`Fetching active, non-encrypted vaults`);
    try {
        const response = await axiosInstance.get('https://dev-api.tusky.io/vaults?status=active&limit=1000', {
            headers: getCommonHeaders(idToken)
        });
        const vaults = response.data.items.filter(vault => !vault.encrypted && vault.status === 'active');
        if (vaults.length === 0) {
            logger.error('No active, non-encrypted vaults found');
            return [];
        }
        logger.info(`Found ${vaults.length} active, non-encrypted vaults`);
        return vaults.map(vault => vault.id);
    } catch (error) {
        logger.error(`Failed to fetch vaults: ${error.message}`);
        if (error.response) {
            logger.error(`API response: ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
};

const uploadFile = async (idToken, vaultId, axiosInstance) => {
    logger.step(`Uploading file to vault ${vaultId}`);
    try {
        const imageResponse = await axios.get(DEFAULT_IMAGE_URL, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data);
        const fileName = `image_${Date.now()}.jpg`;
        const fileSize = imageBuffer.length;
        const mimeType = 'image/jpeg';

        const uploadMetadata = {
            vaultId: vaultId,
            parentId: vaultId, // Asumsi rootFolderId sama dengan vaultId untuk upload langsung
            relativePath: 'null', // 'null' string, tidak perlu di-base64 jika tidak ada path
            name: fileName,
            type: mimeType,
            filetype: mimeType,
            filename: fileName,
        };

        const uploadHeaders = getUploadHeaders(idToken, fileSize, uploadMetadata);

        // --- Perubahan: Menggunakan UPLOAD_API_URL yang baru ---
        const uploadResponse = await axiosInstance.post(UPLOAD_API_URL, imageBuffer, {
            headers: uploadHeaders,
            // Tidak ada `params` yang disertakan di sini kecuali API Tusky secara eksplisit membutuhkannya
        });

        const uploadId = uploadResponse.data.uploadId || uploadResponse.data.id; // Asumsi respons memiliki uploadId atau id
        logger.success(`File uploaded, ID: ${uploadId}`);
        logger.info(`File details: ${fileName} (${(fileSize / 1000000).toFixed(2)} MB)`);

        return uploadId;
    } catch (error) {
        logger.error(`Failed to upload file: ${error.message}`);
        if (error.response) {
            logger.error(`API response: ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
};

const main = async () => {
    logger.banner();
    const accounts = loadTokens();
    if (accounts.length === 0) {
        logger.error('No tokens found in .env file');
        return;
    }

    const proxies = loadProxies();
    let proxyIndex = 0;

    const numberOfUploads = await new Promise((resolve) => {
        rl.question('Enter the number of uploads to perform: ', (answer) => {
            resolve(parseInt(answer, 10) || 1);
        });
    });
    logger.info(`Will perform ${numberOfUploads} uploads`);

    for (const account of accounts) {
        try {
            const idToken = account.idToken;
            logger.step(`Using token: ${idToken.slice(0, 20)}...`);

            const proxyUrl = proxies.length > 0 ? proxies[proxyIndex % proxies.length] : null;
            const axiosInstance = createAxiosInstance(proxyUrl);
            proxyIndex++;

            await fetchStorageInfo(idToken, axiosInstance);

            const vaultIds = await fetchVaults(idToken, axiosInstance);
            if (vaultIds.length === 0) {
                logger.error('No vaults available for uploading');
                continue;
            }

            // Loop melalui setiap vault dan lakukan upload
            for (const vaultId of vaultIds) {
                logger.step(`Processing vault ${vaultId}`);
                for (let i = 0; i < numberOfUploads; i++) {
                    logger.step(`Upload ${i + 1} of ${numberOfUploads} to vault ${vaultId}`);
                    await uploadFile(idToken, vaultId, axiosInstance); // Panggil fungsi uploadFile yang baru
                    logger.success(`Upload ${i + 1} completed for vault ${vaultId}`);
                }
            }
        } catch (error) {
            logger.error(`Error for token: ${error.message}`);
            if (error.response) {
                logger.error(`API response: ${JSON.stringify(error.response.data)}`);
            }
        }
    }

    rl.close();
};

main().catch((error) => {
    logger.error(`Fatal error: ${error.message}`);
    rl.close();
});
