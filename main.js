var fs = require('fs');
var os = require('os');
var drivelist = require('drivelist');

(function() {
    angular
        .module('diskanalysis', [])
        .controller('MainController', MainController);

    MainController.$inject = ['$scope', '$interval'];

    function MainController($scope) {

        var tree = [];

        $scope.analysis = analysis;

        // 获取硬盘信息
        drivelist.list((error, disks) => {
            if (error) throw error;
            $scope.$apply(() => $scope.disks = disks)
        });

        function analysis(mountpoint) {
            // let dist = mountpoint.split(',');
            let tree = {
                path: '/home/ruiming/Dropbox/',
                file: [],
                folder: [],
            };
            search(tree).then(tree => {
                console.log(tree);
            });
        }

        function search(tree) {
            return new Promise((resolve, reject) => {
                fs.readdir(tree.path, (err, data) => {
                    if(err) {
                        console.log(err);
                        reject(err);
                    } else {
                        let promises = data.map(fileName => {
                            return new Promise((resolve, reject) => {
                                fs.stat(tree.path + fileName, (err, data) => {
                                    if (err) {
                                        console.log(err);
                                        reject(err);
                                    } else {
                                        data.path = tree.path + fileName;
                                        if (data.isFile()) {
                                            tree.file.push(data);
                                        } else {
                                            data.path += '/';
                                            data.folder = [];
                                            data.file = [];
                                            tree.folder.push(data);
                                        }
                                        resolve(data);
                                    }
                                })
                            });
                        });
                        // { path: '', file: [stat ... ], folder: [stat ...] }
                        Promise.all(promises).then(() => {
                            resolve(tree);
                        });
                    }
                })
            }).then(datas => {
                return new Promise((resolve, reject) => {
                    let promises = datas.folder.map(stat => {
                        return search(stat);
                    });
                    Promise.all(promises).then(() => {
                        resolve(tree);
                    })
                });
            }).then(() => {
                return tree;
            })
        }

    }

}());
