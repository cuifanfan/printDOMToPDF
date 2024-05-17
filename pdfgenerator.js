const express = require('express');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const log4js = require('log4js');
const { PDFDocument } = require('pdf-lib');
const artTemplate = require('art-template');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
// 用户配置的信息
const serverConfig = JSON.parse(fs.readFileSync('./pdfgenerator.config.json'));
// 配置日志
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

/**
 * @description 检查日志是否已满
 * @param {Object} 
 * @returns {*} 
 */
function checkLogFull(logConfig, handler) {
    const logPath = logConfig.path;
    const logLimitSize = logConfig.size;
    const logSize = getFolderSize(logPath, (err) => logger.error(err));
    if (logSize > logLimitSize) {
        handler && handler(logPath);
    }
}
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
 * @param {Array} pdfArray
 * @returns {Buffer} pdf buffer数据
 */
async function mergePDF(pdfArray) {
    // 创建新的 PDF 文档
    const pdfDocs = await PDFDocument.create();
    for (const onePDFPage of pdfArray) {
        // 读取当前PDF
        const pdfItem = await PDFDocument.load(onePDFPage);
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
    const htmlTemplate = fs.readFileSync(path.join(serverConfig.viewsPath, htmlPath)).toString();
    const cssTemplate = fs.readFileSync(path.join(serverConfig.viewsPath, cssPath)).toString();
    return htmlTemplate.replace(identifier, cssTemplate);
}

/**
 * @description 提取请求体中的pdf打印配置信息
 * @param {Object} pdfConfig 请求体
 * @returns {Object} 处理后的PDF配置信息
 */
function extractPDFConfig(pdfConfig) {
    let { width, height, scale, margin, host} = pdfConfig;
    width = width ? Number(width) : 1200;
    height = height ? Number(height) : 1200;
    scale = Math.min(scale ? Number(scale) : 1, 2);
    margin = margin ? margin : { top: '25px', left: '10px', right: '10px' };
    return {
        printConfig: {
            width: width,
            height: height,
            scale: scale,
            margin: margin,
            printBackground: true, // 保留背景
            '-webkit-print-color-adjust': 'exact'
        },
        host: host
    }
}

/**
 * @description 创建服务
 * @param {Function} 构造器
 * @returns {Object} 服务对象
 */
function createServer(excutor) {
    const app = excutor();
    // 解析POST请求参数
    app.use(bodyParser.json({ limit: '10mb' }));
    app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
    // 处理跨域
    app.use(cors());
    // 配置模板引擎
    app.engine('html', artTemplate);
    app.set('views', serverConfig.viewsPath);
    app.set('view engine', 'html');
    app.listen(serverConfig.port, () => {
        console.log(`welcome, server is running at ${serverConfig.port}...`);
    });
    return app;
}

/**
 * @description 数据平台-漆面检测-数据分析-获取模板服务
 * @param {Object} app 服务对象
 * @param {String} url 服务地址
 */
function getSpecularDetectionReportTemplate(app, url) {
    /**
     * @description 数据平台-漆面检测-数据分析-获取模板
     */
    app.post(url, (request, response) => {
    try {
        const data = request.body;
        data.pageNum = 2 + Math.ceil((data.Pictures.length - 7) / 11); // PDF总页数
        const specularDetectionReportHTML = renderTemplateHTML(
            `./accuAnalyzer/specularDetection/digitalAnalysis/reportTemplate.html`,
            `./accuAnalyzer/specularDetection/digitalAnalysis/reportTemplate.css`,
        );
        const htmlStr = artTemplate.render(specularDetectionReportHTML, data);
        response.send(htmlStr);
    } catch (err) {
        logger.error(err);
    }
    });
}

/**
 * @description 通用接口-转换HTML模板为PDF
 * @param {Object} app 服务对象
 * @param {String} url 服务地址
 */
async function convertHTMLToPDF(app, url) {
    const browser = await puppeteer.launch({ headless: 'new',});
    const page = await browser.newPage();
    /**
     * @description 转换HTML模板为PDF
     * @param {Array} htmlContents HTML模板数组
     * @param {Number} width PDF宽度
     * @param {Number} height PDF高度
     * @param {Number} scale PDF缩放系数
     * @param {Array} margin PDF边距
     * @param {Number} height PDF高度
     * @param {String} host 模板中引用的资源文件第三方服务地址
     * @returns {Buffer} 
    */ 
    app.post(url, async (request, response) => {
        try {
            // 日志满的话，删除一半
            checkLogFull(serverConfig.logs, clearHalfFolder);

            const htmlContents = request.body.htmlContents;
            const pdfConfig = extractPDFConfig(request.body);
            
            // 处理模板第三方资源引用
            for (let i = 0; i < htmlContents.length; i++) {
                htmlContents[i] = handleHTMLReference(htmlContents[i], pdfConfig.host);
            }

            // 为每个模板生成一张PDF
            const pdfArray = [];
            for (const htmlContent of htmlContents) {
                await page.setContent(htmlContent);
                const onePagePDF = await page.pdf(pdfConfig.printConfig);
                pdfArray.push(onePagePDF);
            }

            // 合并所有页面的PDF
            const mergedPDF = await mergePDF(pdfArray);
            response.setHeader('Content-type', 'application/pdf');
            response.send(Buffer.from(mergedPDF));
        } catch (err) {
            logger.error(err);
            await browser.close();
        }
    });
}

const app = createServer(express);
convertHTMLToPDF(app, '/v1/pdfgenerator/point_graph');
getSpecularDetectionReportTemplate(app, '/v1/pdfgenerator/get_template');
