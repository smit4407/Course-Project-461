import * as fs from 'fs';
import * as readline from 'readline';
import { BusFactor } from './BusFactor';
import { RM } from './RM';
import { License } from './License';
import { RampUp } from './RampUp';
import { Correctness } from './Correctness';
import { NetScore } from './NetScore';
import { SystemLogger } from '../utilities/logger';
import * as dotenv from 'dotenv';
import { NpmApi } from '../api/Api';

// Load environment variables from .env file
dotenv.config();    
SystemLogger.initialize();

export class URLProcessor {
    private urlFile: string;
    private outputFile: string;
    private api: NpmApi;

    constructor(urlFile: string, outputFile: string) {
        this.urlFile = urlFile;
        this.outputFile = outputFile;
        try {
            this.api = new NpmApi();
        } catch (error) {
            SystemLogger.error(`Error creating NpmApi object: ${error}`);
            throw error;
        }

        // Clear the output file when the class is instantiated
        this.clearOutputFile();
    }

    // Method to clear the output file
    private clearOutputFile(): void {
        try {
            fs.writeFileSync(this.outputFile, ''); // Overwrite the file with an empty string
        } catch (error) {
        }
    }

    public async processUrlsFromFile(): Promise<void> {
        SystemLogger.info(`Processing URLs from file: ${this.urlFile}\n\n\n\n`);
        try {
            if (!fs.existsSync(this.urlFile)) {
                throw new Error(`File at "${this.urlFile}" does not exist.`);
            }

            const fileStream = fs.createReadStream(this.urlFile);
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });

            for await (const line of rl) {
                const url = line.trim();
                SystemLogger.info(`Processing URL: ${url}`);
                const githubUrl = await this.determineLinkType(url);
                SystemLogger.info(`Processing URL: ${githubUrl}`);
                const evaluationResults = await this.evaluateUrl(githubUrl);
                this.writeResults(evaluationResults);
            }

        } catch (error) {
            process.exit(1); // Signal failure
        }
    }

    // Method to determine the type of link (GitHub or NPM) and return the appropriate URL
    private async determineLinkType(url: string): Promise<string> {
        const githubRegex = /https:\/\/github.com\/.*/;
        const npmRegex = /https:\/\/www.npmjs.com\/package\/.*/;
    
        if (githubRegex.test(url)) {
            SystemLogger.info(`GitHub URL detected: ${url}`);
            return url;
        } else if (npmRegex.test(url)) {
            SystemLogger.info(`NPM URL detected: ${url}`);
    
            // Extracting the part after '.com/' for NPM URLs
            const npmPart = url.split('package')[1];
            SystemLogger.info(`NPM URL part after .com: ${npmPart}`);
    
            let repoUrl = await this.api.getRepo(npmPart);
            SystemLogger.info(`NPM URL converted to GitHub URL: ${repoUrl}`);
    
            return repoUrl;
        } else {
            throw new Error('Invalid URL Type: Must be a GitHub or NPM URL');
        }
    }

    private async evaluateUrl(url: string): Promise<Record<string, any>> {
        SystemLogger.info(`Evaluating URL: ${url}`);
        // BusFactor latency
        const busFactorStart = process.hrtime();
        const tbusFactor = new BusFactor(url);
        await tbusFactor.init();
        const busFactor = tbusFactor.getScore();
        const busFactorEnd = process.hrtime(busFactorStart);
        const busFactorLatency = (busFactorEnd[0] * 1e9 + busFactorEnd[1]) / 1e9; // Convert to seconds

        // ResponsiveMaintainer (RM) latency
        const rmStart = process.hrtime();
        const tRM = new RM(url);
        await tRM.init();
        const responsiveMaintainer = tRM.getScore();
        const rmEnd = process.hrtime(rmStart);
        const rmLatency = (rmEnd[0] * 1e9 + rmEnd[1]) / 1e9; // Convert to seconds

        // License latency
        const licenseStart = process.hrtime();
        const tlicense = new License(url);
        await tlicense.init();
        const license = tlicense.getScore();
        const licenseEnd = process.hrtime(licenseStart);
        const licenseLatency = (licenseEnd[0] * 1e9 + licenseEnd[1]) / 1e9; // Convert to seconds

        // RampUp latency
        const rampUpStart = process.hrtime();
        const trampUp = new RampUp(url);
        await trampUp.init();
        const rampUp = trampUp.getScore();
        // const rampUp = 1;
        const rampUpEnd = process.hrtime(rampUpStart);
        const rampUpLatency = (rampUpEnd[0] * 1e9 + rampUpEnd[1]) / 1e9; // Convert to seconds

        // Correctness latency
        const correctnessStart = process.hrtime();
        const tcorrectness = new Correctness(url);
        await tcorrectness.init();
        const correctness = tcorrectness.getScore();
        // const correctness = 1;
        const correctnessEnd = process.hrtime(correctnessStart);
        const correctnessLatency = (correctnessEnd[0] * 1e9 + correctnessEnd[1]) / 1e9; // Convert to seconds

        // NetScore latency
        const tnetScore = new NetScore(url, [busFactor, responsiveMaintainer, rampUp, correctness, license], [0.2, 0.2, 0.2, 0.2, 0.2], [busFactorLatency, rmLatency, rampUpLatency, correctnessLatency, licenseLatency]);
        const netScore = tnetScore.getScore();
        const netScoreLatency = tnetScore.getLatency(); // Convert to seconds

        // Return evaluation results for logging/output
        return {
            URL: url,
            NetScore: parseFloat(netScore.toFixed(3)),
            NetScore_Latency: parseFloat(netScoreLatency.toFixed(3)),
            BusFactor: parseFloat(busFactor.toFixed(3)),
            BusFactor_Latency: parseFloat(busFactorLatency.toFixed(3)),
            ResponsiveMaintainer: parseFloat(responsiveMaintainer.toFixed(3)),
            ResponsiveMaintainer_Latency: parseFloat(rmLatency.toFixed(3)),
            RampUp: parseFloat(rampUp.toFixed(3)),
            RampUp_Latency: parseFloat(rampUpLatency.toFixed(3)),
            Correctness: parseFloat(correctness.toFixed(3)),
            Correctness_Latency: parseFloat(correctnessLatency.toFixed(3)),
            License: parseFloat(license.toFixed(3)),
            License_Latency: parseFloat(licenseLatency.toFixed(3))
        };
    }

    private writeResults(result: Record<string, any>): void {
        const formattedResult = JSON.stringify(result);
        // Write each result in NDJSON format to the output file
        fs.appendFileSync(this.outputFile, formattedResult + '\n', 'utf8');
        console.log(formattedResult);
    }
}

// Main function to handle command-line arguments and run the URLProcessor
async function main() {
    if (process.argv.length !== 4) {
        console.error('Usage: ts-node <script> <urlFile> <outputFile>');
        process.exit(1);
    }

    const [, , urlFile, outputFile] = process.argv;

    const urlProcessor = new URLProcessor(urlFile, outputFile);
    await urlProcessor.processUrlsFromFile();
}

main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
});
