var fs = require('original-fs');
var os = require('os');
var drivelist = require('drivelist');
const childProcess = require('child_process');

(function() {
    angular
        .module('diskanalysis', [])
        .controller('MainController', MainController);

    MainController.$inject = ['$scope', '$interval'];

    function MainController($scope, $interval) {


        $scope.analysis = analysis;

        function analysis(mountpoint) {
            const worker = childProcess.fork('worker.js');

            worker.on('message',function(mes) {
                console.log(mes);
            });

            worker.send('/home/ruiming/Desktop/');
        }

        // 获取硬盘信息
        drivelist.list((error, disks) => {
            if (error) throw error;
            $scope.$apply(() => {
                $scope.disks = disks;
            })
        });

        // 获取挂载点的信息
        function getDiskMessage(disk) {
            // Read a mountpoint message
            return new Promise((resolve, reject) => {
                let sh, re;
                switch (os.platform()) {
                    case 'linux':
                        sh = 'df -h -k ' + disk.mounted;
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
                        disk.usedSpace = space[1];
                        disk.availableSpace = space[2];
                        disk.used = space[3];
                        console.log(disk);
                        resolve(disk);
                    }
                });
            });
        }

    }
}());
