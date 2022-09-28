
var ESC = require("../../esc_core");
const yargs = require('yargs');
const axios = require('axios');

let config = {
  conexionPath: "./network/organizations/peerOrganizations/org1.example.com/connection-org1.json",
  resultsPath: "./experiments_results/103/falcon/",
  identityName: "admin",
  channelName: "escchannel",
  chaincodeName: "falcon",
  csvResultsCalculationsHeader: "RESPONSES,TOTAL_TIME,ANALYSIS_TIME,FREQUENCY,TIME_DATA,FREQUENCY_DATA,RESPONSES_STORED,FROM_DATE,TO_DATE,MINIMUM_TIME,MAXIMUM_TIME,ANALYSIS_RETRIES,HOOK_DATA_RETRIES,PERCENTAGE_OF_200_STATUS_CODE\n",
  csvResultsExperimentHeader: "FREQUENCY,TIME_DATA,MIN_TIME,MAX_TIME,AVG_TIME,STD_TIME,SUCCESFUL_CALCULATIONS,CALCULATIONS_OVER_MAX\n",
  csvResultsHarvestHeader: "INIT_TIME,FINAL_TIME,TOTAL_TIME,INIT_UPDATE_TIME,FINAL_UPDATE_TIME\n",

  executionTime: 300,
  analysisFrequency: 30,
  harvestFrequency: 30,
  analysisStartDelay: 15,
  harvestStartDelay: 0,
  dataTimeLimit: 90,
  frequencyControlCalculate: 1,
  maximumTimeAnalysis: 3.2,
  minimumTimeAnalysis: 3,
  elasticityMode: "noElasticity",
  experimentName: "test",
  coldStart: false,
  numberOfESCs: 16,
  dataPerHarvest: 1,
  analysisRetryTime: 500,
  numberOfTimesForAnalysisAvg: 5,

    
  updateDataContract: "updateData",
  evaluateWindowTimeContract: "evaluateHistory",
  evaluateHarvestFrequencyContract: "evaluateFrequency",
  queryAnalysisHolderContract: "queryDataCalculation",
  analysisHolderId: 1,
  analysisContract: "analysis",
  dataStorageContract: "createData",
  calculationStorageContract: "createDataCalculation",



}

let harvesterHookParams = {
  dataNumber: 1
}

let analyserParams = {
  dataNumbers: 1
}

var stop = false;
var interval = "";
var timeout = "";
let intervalColdStart = "";


async function hookData(){

  return new Promise(async (resolve, reject) => {

    let data = {};

    axios.get("https://exporter.galibo.governify.io/metrics").then(response => {
      let dataAux = response.data.split("\n")
      for (let i = 0; i < dataAux.length; i++) {
        if(dataAux[i].includes("assets_http_response_count_total{")){
          let value = dataAux[i].split(" ")[1]
          if(dataAux[i].includes("200")){
            data.goodResponses ? data.goodResponses = data.goodResponses + parseInt(value): data.goodResponses = parseInt(value);
          } else {
            data.badResponses ? data.badResponses = data.badResponses + parseInt(value): data.badResponses = parseInt(value);
          }
        }
      }
      
    let newData = {
      dataCollectedDateTime: Date.now(),
      numberResponses: 1,
      metricValues: data,
    };

    resolve(newData);

    }).catch(err => {
      console.log(err)
      reject(err);
    });
  });

}



const argv = yargs
  .command('start', 'start the esc', {
    }
  )
.help().alias('help', 'h').argv; 



/**
 * Call the harvester in esc_core/index regularly with the frequency given and in case of having an elastic frequency it monitors any changes in it and applies it. 
 * 
 * In this function it is defined from where and how the data is taken to introduce it in the blockchain.
 * @function
 * @param {number} frequency - The initial frequency in seconds to harvest data.
 */
async function intervalHarvester(frequency, metricQueries, agreement) {

  if(config.elasticityMode == "harvestFrequency"){
    ESC.frequencyChanged(config.chaincodeName);
    interval = setInterval(() => {
  
      ESC.getNewFrequency(config.chaincodeName).then(async (res) =>{
  
        if(res.change){
  
          clearInterval(interval);

          if(!stop){
            intervalHarvester(res.newFrequency)
          }
          
  
        }else{
  
          let newData = await hookData();
  
          ESC.harvesterHook(harvesterHookParams, newData,config.chaincodeName);

        }
      })
      
    }, frequency*1000);
  }else{
    interval = setInterval(async () => {
    
      let newData = await hookData();
  
      ESC.harvesterHook(harvesterHookParams, newData,config.chaincodeName);
  
    }, frequency*1000);
  
    timeout = setTimeout(() => {
      clearInterval(interval);
      console.log("************** EXECUTION COMPLETED, SHUTING DOWN ********************")
    }, config.executionTime*1000 + 100);
  }

}

if (argv._.includes('start')) {

  ESC.configurate(config,config.chaincodeName)

  stop = false;
  
  ESC.connect(config.chaincodeName).then(async () =>{

    intervalColdStart = setInterval(async () => {
      if((ESC.ESCnumber.counter == config.numberOfESCs && config.coldStart) || !config.coldStart){
        clearInterval(intervalColdStart);
  
        ESC.analyser(analyserParams,config.chaincodeName);
      
        ESC.harvesterListener(config.chaincodeName);

        ESC.updateDataListener(config.chaincodeName);
  
        setTimeout(() => {
          console.log("HARVEST STARTED")
          intervalHarvester(config.harvestFrequency);
        } , config.harvestStartDelay*1000);

        if(config.elasticityMode == "harvestFrequency") {
          timeout = setTimeout(() => {
            stop = true;
            console.log("************** EXECUTION COMPLETED, SHUTING DOWN ********************")
          }, config.executionTime*1000 + 100);
        }
      }
    }, 1);
  })

}



module.exports.config = config;
module.exports.chaincodeName = function(){
  console.log(config.chaincodeName)
};
module.exports.stop = stop;
module.exports.getIntervals= function() {
  return [interval,timeout];
};