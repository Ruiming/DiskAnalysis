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
            if(dist.indexOf('/') !== -1) {
                // TODO
                root.path = '/etc/';
                new Promise((resolve, reject) => {
                    fs.stat(root.path, (err, data) => {
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
        }

        function search(tree) {
            return new Promise((resolve, reject) => {
                fs.readdir(tree.path, (err, data) => {
                    if (err) {
                        // TODO
                        log.push(err);
                        resolve();
                    } else {
                        let promises = data.map(fileName => {
                            return new Promise((resolve, reject) => {
                                fs.stat(tree.path + fileName, (err, stat) => {
                                    if (err) {
                                        // TODO
                                        log.push(err);
                                        resolve();
                                    } else {
                                        stat.path = tree.path + fileName;
                                        if (stat.isDirectory()) {
                                            stat.folderCount = 0;
                                            stat.path += '/';
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
                            debugger;
                        });
                    });
            })
        }
    }

}());
