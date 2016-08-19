(function() {
    var fs = require('original-fs');
    const v8 = require('v8');
    v8.setFlagsFromString('--max_old_space_size=8192');

    var root = {};
    var log = [];
    var calc = 0;

    process.on('message',function(mes) {
        console.log(`from master, message: ${mes}`);
        var startTime = new Date().getTime();
        // let dist = mountpoint.split(',');
        // TODO: multi mountpoint ?
        root.path = mes;
        new Promise((resolve, reject) => {
            fs.lstat(root.path, (err, data) => {
                if (err) {
                    log.push(err);
                    reject(err);
                } else {
                    Object.assign(root, {file: [], folder: [], size: 0, fileCount: 0, folderCount: 0});
                    resolve(root);
                }
            });
        }).then(root => search(root))
            .then(() => {
                var endTime = new Date().getTime();
                let usedTime = endTime - startTime;
                process.send({
                    type: 'end',
                    usedTime: usedTime,
                    startTime: startTime,
                    endTime: endTime,
                    log: log
                });
                process.send({
                    type: 'data',
                    file: root.file
                });
                process.nextTick(() => {
                    process.send(root);
                });
            });
    });

    function search(tree) {
        return new Promise((resolve, reject) => {
            fs.readdir(tree.path, (err, data) => {
                // Use resolve to avoid Promise.all no work
                if (err) {
                    log.push(err);
                    resolve();
                } else {
                    let promises = data.map(fileName => {
                        return new Promise((resolve, reject) => {
                            fs.lstat(tree.path + fileName, (err, stat) => {
                                if (err) {
                                    log.push(err);
                                    resolve();
                                } else {
                                    let file = Object.assign({fileCount: 0, folderCount: 0, type: 'file',
                                        file: [], folder: [], size: stat.size, path: tree.path + fileName});
                                    // ignore directory /proc
                                    if (file.path === '/proc') {
                                        tree.fileCount++;
                                        file.fileCount = 1;
                                        tree.file.push(file);
                                    } else if (stat.isDirectory()) {
                                        file.path += '/';
                                        file.type = 'folder';
                                        tree.folder.push(file);
                                    } else {
                                        // 用于计算进度
                                        calc += stat.size;
                                        // 文件数计算
                                        tree.size += file.size;
                                        tree.fileCount++;
                                        file.fileCount = 1;
                                        tree.file.push(file);
                                    }
                                    resolve(file);
                                }
                            })
                        });
                    });
                    Promise.all(promises).then(() => {
                        if(calc % 141 === 0) {
                            process.send({
                                type: 'processing',
                                size: calc
                            });
                        }
                        resolve(tree);
                    });
                }
            })
        }).then(tree => {
            return new Promise((resolve, reject) => {
                let promises = tree.folder.map(stat => {
                    return search(stat);
                });
                Promise.all(promises).then(datas => {
                    datas.map(stat => {
                        // 文件夹计算
                        if (stat && stat.type === 'folder')  tree.folderCount += stat.folderCount + 1;
                        // 容量计算
                        if (stat) {
                            tree.size += stat.size;
                            tree.fileCount += stat.fileCount;
                        }
                    });
                    resolve(tree);
                }).catch(err => {
                    log.push(err);
                });
            });
        })
    }
}());