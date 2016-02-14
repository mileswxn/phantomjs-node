import phantomjs from "phantomjs-prebuilt";
import {spawn} from "child_process";
import winston from "winston";
import os from "os";
import Linerstream from "linerstream";
import Page from "./page";
import Command from "./command";

const logger = new winston.Logger({
    transports: [
        new winston.transports.Console({
            level: process.env.DEBUG === 'true' ? 'debug' : 'info',
            colorize: true
        })
    ]
});

export default class Phantom {
    constructor(args = []) {
        logger.debug(`Starting ${phantomjs.path} ${args.concat([__dirname + '/shim.js']).join(' ')}`);
        this.process = spawn(phantomjs.path, args.concat([__dirname + '/shim.js']));
        this.commands = new Map();

        this.process.stdin.setEncoding('utf-8');

        this.process.stdout.pipe(new Linerstream()).on('data', (data) => {
            const message = data.toString('utf8');
            if (message[0] === '>') {
                let json = message.substr(1);
                logger.debug('Parsing: %s', json);
                const command = JSON.parse(json);
                this.commands.get(command.id).deferred.resolve(command.response);
                this.commands.delete(command.id);
            } else {
                logger.info(message);
            }
        });

        this.process.stderr.on('data', (data) => {
            logger.error(data);
        });

        this.process.on('exit', (code) => {
            //console.log(`Child exited with code ${code}`);
        });
    }

    createPage() {
        return Promise.resolve(new Page(this));
    }

    execute(command) {
        command.deferred = Promise.defer();
        this.commands.set(command.id, command);
        logger.debug('Sending: %s', JSON.stringify(command));
        this.process.stdin.write(
            JSON.stringify(command, (key, val) => typeof val === 'function' ? val.toString() : val) + os.EOL, 'utf8'
        );

        return command.deferred.promise;
    }

    exit() {
        this.execute(new Command(null, 'phantom', 'exit'));
    }
}