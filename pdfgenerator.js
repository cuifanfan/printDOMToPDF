const express = require('express');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const log4js = require('log4js');
const { PDFDocument } = require('pdf-lib');
const artTemplate = require('art-template');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

/**
 * @description 获取文件夹大小
 * @param {String} folderPath 文件夹路径
 * @param {Function} errHandler 错误处理函数
 * @returns
 */
function getFolderSize(folderPath, errHandler) {
    try {
        const fileNames = fs.readdirSync(folderPath);
        let totalSize = 0;
        fileNames.forEach(fileName => {
            const filePath = path.join(folderPath, fileName);
            totalSize += fs.statSync(filePath).size;
        });
        return totalSize;
    } catch (err) {
        errHandler && errHandler(err);
    }
}

/**
 * @description 删除文件夹下所有文件
 * @param {String} folderPath 文件夹路径
 * @param {Function} errHandler 错误处理函数
 */
function clearHalfFolder(folderPath, errHandler) {
    try {
        const fileNames = fs.readdirSync(folderPath);
        // 每次删除一半
        const halfFileNames = fileNames.slice(0, Math.floor(fileNames.length / 2));
        halfFileNames.forEach(fileName => {
            const filePath = path.join(folderPath, fileName);
            fs.unlinkSync(filePath);
        });
    } catch (err) {
        errHandler && errHandler(err);
    }
}

/**
 * @description 合并多个pdf为一页
 * @param {Array} pdfs
 * @returns {Buffer} pdf buffer数据
 */
async function mergePDF(pdfs) {
    // 创建新的 PDF 文档
    const pdfDocs = await PDFDocument.create();
    for (const pdf of pdfs) {
        // 读取当前PDF
        const pdfItem = await PDFDocument.load(pdf);
        // 复制每一页
        const pageCount = pdfItem.getPageCount();
        for (let i = 0; i < pageCount; i++) {
            const [PDFPageItem] = await pdfDocs.copyPages(pdfItem, [i]);
            pdfDocs.addPage(PDFPageItem);
        }
    }
    return pdfDocs.save();
}

/**
 * @description 处理引用地址
 * @param {String} html html文本
 * @param {String} host 引用的根地址
 * @returns {String} 处理后的URL
 */
function handleHTMLReference(html, host) {
    return html.replace(/(src|href)="((?!data:.*?;base64,).*?)"/g, `$1="${host}/$2"`)
               .replace(/url\(&quot;\/v1\/file/g, `url(&quot;${host}/v1/file`);
}

/**
 * @description 获取模板
 * @param {String} htmlPath HTML模板地址
 * @param {String} cssPath CSS模板地址
 * @param {String} identifier CSS替换标识符
 * @returns {String} 模板
 */
function renderTemplateHTML(htmlPath, cssPath, identifier='/***ISV_PDF_STYLE***/') {
    const htmlTemplate = fs.readFileSync(path.join(viewsPath, htmlPath)).toString();
    const cssTemplate = fs.readFileSync(path.join(viewsPath, cssPath)).toString();
    return htmlTemplate.replace(identifier, cssTemplate);
}

// 日志性相关
const logPath = './logs';
const logger = log4js.getLogger();
log4js.configure({
    replaceConsole: true,
    appenders: {
        cheese: {
            // 设置类型为 dateFile
            type: 'dateFile',
            // 配置文件名为 myLog.log
            filename: 'logs/pdfgenerator.log',
            // 指定编码格式为 utf-8
            encoding: 'utf-8',
            // 配置 layout，此处使用自定义模式 pattern
            layout: {
                type: 'pattern',
                // 配置模式
                // pattern: '{"date":"%d","level":"%p","category":"%c","host":"%h","pid":"%z","data":\'%m\'}'
                pattern: '%d %p %m'
            },
            // 日志文件按日期（天）切割
            pattern: 'yyyy-MM-dd',
            // 回滚旧的日志文件时，保证以 .log 结尾 （只有在 alwaysIncludePattern 为 false 生效）
            keepFileExt: true,
            // 输出的日志文件名是都始终包含 pattern 日期结尾
            alwaysIncludePattern: true
        },
    },
    categories: {
        // 设置默认的 categories
        default: { appenders: ['cheese'], level: 'debug' },
    }
});
// 读取自定义配置信息
const config = JSON.parse(fs.readFileSync('./pdfgenerator.config.json'));
const port = config.port;
const logLimitSize = config.logs.size;
const viewsPath = config.viewsPath;

const app = express();
// 解析POST请求参数
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
// 处理跨域
app.use(cors());

// 配置模板引擎
app.engine('html', artTemplate);
app.set('views', viewsPath);
app.set('view engine', 'html');


// 数据平台-漆面检测-数据分析-获取模板
const specularDetectionReportHTML = renderTemplateHTML(
    `./accuAnalyzer/specularDetection/digitalAnalysis/reportTemplate.html`,
    `./accuAnalyzer/specularDetection/digitalAnalysis/reportTemplate.css`,
);
app.post('/v1/pdfgenerator/get_template', (request, response) => {
    try {
        const data = request.body;
        data.pageNum = 2 + Math.ceil((data.Pictures.length - 7) / 11); // PDF总页数
        const htmlStr = artTemplate.render(specularDetectionReportHTML, data);
        response.send(htmlStr);
    } catch (err) {
        logger.error(err);
    }
});

(async () => {
    const browser = await puppeteer.launch({ headless: 'new',});
    const page = await browser.newPage();
    app.post('/v1/pdfgenerator/point_graph', async (request, response) => {
        try {
            // 如果日志文件夹大小大于1M，删除文件夹下一半文件
            const logSize = getFolderSize(logPath, (err) => logger.error(err));
            if (logSize > logLimitSize) clearHalfFolder(logPath, (err) => logger.error(err));

            // html列表、文件名、PDF宽高、第三方引用地址、缩放倍数
            let { htmlContents, width, height, host, scale, margin} = request.body;
            width = width ? Number(width) : 1200;
            height = height ? Number(height) : 1200;
            host = host ? host : 'http://127.0.0.1:' + port;
            scale = scale ? Number(scale) : 1;
            scale = Math.min(Number(scale), 2);
            margin = margin ? margin : { top: '25px', left: '10px', right: '10px' };
            // 处理第三方资源引用
            for (let i = 0; i < htmlContents.length; i++) {
                htmlContents[i] = handleHTMLReference(htmlContents[i], host);
            }

            const pdfs = [];
            for (const htmlContent of htmlContents) {
                await page.setContent(htmlContent);
                pdfs.push(await page.pdf({
                    width: width,
                    height: height,
                    scale: scale,
                    margin: margin,
                    printBackground: true, // 保留背景
                    '-webkit-print-color-adjust': 'exact'
                }));
            }
            // 合并所有页面的PDF，得到Buffer
            const pdfBuffer = Buffer.from(await mergePDF(pdfs));
            response.setHeader('Content-type', 'application/pdf');
            response.send(pdfBuffer);
        } catch (err) {
            logger.error(err);
            await browser.close();
        }
    });
})()
app.listen(port, () => {
    console.log(`welcome, server is running at ${port}...`);
});
