var fs = require('original-fs');
var os = require('os').platform();
var drivelist = require('drivelist');
const childProcess = require('child_process');

(function() {
    angular
        .module('diskanalysis', ['ui.bootstrap'])
        .controller('MainController', MainController);

    MainController.$inject = ['$scope', '$interval'];

    function MainController($scope, $interval) {
        let vm = this;
        // 状态显示
        vm.max = 0;
        vm.current = 0;
        // 显示磁盘
        vm.disks = null;

        // 函数调用
        vm.analysis = analysis;

        // 获取硬盘及分区信息
        // TODO: prefetch every disk's size
        drivelist.list((error, disks) => {
            if (error) throw error;
            let promises = [];
            for(let i=0; i<disks.length; i++) {
                if(!disks[i].mountpoint) continue;
                let mountpoint = disks[i].mountpoint.split(',');
                for(let j=0; j<mountpoint.length; j++) {
                    promises.push(getDiskMessage(mountpoint[j]))
                }
                Promise.all(promises).then(data => {
                    let k = 0;
                    for(let i=0; i<disks.length; i++) {
                        if(!disks[i].mountpoint) continue;
                        let mountpoint = disks[i].mountpoint.split(',');
                        disks[i].disks = [];
                        for(let j=0; j<mountpoint.length; j++) {
                            disks[i].disks[j] = data[k++];
                        }
                    }
                    return disks;
                }).then(() => {
                    vm.disks = disks;
                    vm.os = os;
                })
            }
        });

        // 获取挂载点的信息
        function getDiskMessage(disk) {
            // Read a mountpoint message
            return new Promise((resolve, reject) => {
                let sh, re;
                switch (os) {
                    case 'linux':
                        sh = 'df -h -k ' + disk;
                        re = /\s+(\d+)\s+(\d+)\s+(\d+)[%]/;
                        break;
                    default:
                        alert("Your system is not supported");
                }
                childProcess.exec(sh, (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                        console.error(`exec error: ${error}`);
                    } else {
                        let space = stdout.match(re);
                        resolve({
                            usedSpace: space[1],
                            availableSpace: space[2],
                            used: space[3],
                            mountpoint: disk
                        });
                    }
                });
            });
        }

        function analysisWithWorker(disk) {
            const worker = childProcess.fork('worker.js',{
                execArgv: ['--max_old_space_size=8192'] // increase v8's available memory to 4gb
            });
            vm.max = disk.usedSpace * 1024;
            worker.on('message',function(data) {
                console.log(data);
                switch(data.type) {
                    case 'processing':
                        vm.current = data.size;
                        break;
                    case 'end':
                        vm.current = vm.max;
                        vm.end = true;
                        break;
                    case 'result':
                        console.log(data);
                        vm.data = data;
                        break;
                    default:
                }
            });
            worker.send('/home/');
        }

        function analysis(disk) {
            var startTime = new Date().getTime();
            // let dist = mountpoint.split(',');
            // TODO: multi mountpoint ?
            root.path = disk.mountpoint;
            root.max = disk.usedSpace * 1024;
            new Promise((resolve, reject) => {
                fs.lstat(root.path, (err, data) => {
                    if (err) {
                        log.push(err);
                        reject(err);
                    } else {
                        Object.assign(root, data, {file: [], folder: [], size: 0, fileCount: 0, folderCount: 0});
                        resolve(root);
                    }
                });
            }).then(root => search(root))
                .then(() => {
                    var endTime = new Date().getTime();
                    let usedTime = endTime - startTime;
                    root.max = root.size;
                    root.startTime = startTime;
                    root.endTime = endTime;
                    root.usedTime = usedTime;
                    console.log(root);
                });
        }

        var root = {};
        var log = [];
        var calc = 0;

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
                                        stat.path = tree.path + fileName;
                                        stat.atime = stat.ctime = stat.mtime = stat.birthtime = null;
                                        // ignore directory /proc
                                        if (stat.path === '/proc') {
                                            tree.fileCount++;
                                            stat.fileCount = 1;
                                            tree.file.push(stat);
                                            resolve(stat);
                                        } else if (stat.isDirectory()) {
                                            stat.path += '/';
                                            stat.folderCount = 0;
                                            stat.folder = [];
                                            stat.file = [];
                                            stat.fileCount = 0;
                                            tree.folder.push(stat);
                                        } else {
                                            // 用于计算进度
                                            calc += stat.size;
                                            // 文件数计算
                                            tree.size += stat.size;
                                            tree.fileCount++;
                                            stat.fileCount = 1;
                                            tree.file.push(stat);
                                        }
                                        resolve(stat);
                                    }
                                })
                            });
                        });
                        Promise.all(promises).then(() => {
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
                            if (stat && stat.isDirectory())  tree.folderCount += stat.folderCount + 1;
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

        // What can I do to remove this?
        $interval(() => {
            vm.root = root;
            vm.max = root.max;
            vm.current = calc;
        }, 100);

    }
}());
