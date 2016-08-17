var fs = require('original-fs');
var os = require('os');
var drivelist = require('drivelist');

(function() {
    angular
        .module('diskanalysis', [])
        .controller('MainController', MainController);

    MainController.$inject = ['$scope', '$interval'];

    function MainController($scope, $interval) {

        var root = {};
        var log = [];
        $scope.analysis = analysis;

        // 获取硬盘信息
        drivelist.list((error, disks) => {
            if (error) throw error;
            $scope.$apply(() => $scope.disks = disks)
        });

        function analysis(mountpoint) {
            var startTime = new Date().getTime();
            let dist = mountpoint.split(',');
            // TODO: multi mountpoint ?
            root.path = dist[0];
            new Promise((resolve, reject) => {
                fs.lstat(root.path, (err, data) => {
                    if(err) {
                        log.push(err);
                        reject(err);
                    } else {
                        Object.assign(root, data, {file: [], folder: [], size: 0, fileCount: 0, folderCount: 0});
                        resolve(root);
                    }
                });
            }).then(root => search(root))
                .then(() => {
                    console.log(root);
                    var endTime = new Date().getTime();
                    console.log(endTime - startTime + "ms");
                    // debugger;
                    console.log(log);
                });
        }

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
    }
}());
