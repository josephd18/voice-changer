import { useEffect, useMemo, useRef, useState } from "react"
import { VoiceChangerClient } from "../VoiceChangerClient"
import { ClientSettingState, useClientSetting } from "./useClientSetting"
import { ServerSettingState, useServerSetting } from "./useServerSetting"
import { useWorkletNodeSetting, WorkletNodeSettingState } from "./useWorkletNodeSetting"
import { useWorkletSetting, WorkletSettingState } from "./useWorkletSetting"

export type UseClientProps = {
    audioContext: AudioContext | null
    audioOutputElementId: string
}

export type ClientState = {
    initialized: boolean
    // 各種設定I/Fへの参照
    workletSetting: WorkletSettingState
    clientSetting: ClientSettingState
    workletNodeSetting: WorkletNodeSettingState
    serverSetting: ServerSettingState

    // モニタリングデータ
    bufferingTime: number;
    volume: number;
    performance: PerformanceData

    // 情報取得
    getInfo: () => Promise<void>
    // 設定クリア
    clearSetting: () => Promise<void>
}

export type PerformanceData = {
    responseTime: number
    preprocessTime: number
    mainprocessTime: number
    postprocessTime: number
}
const InitialPerformanceData: PerformanceData = {
    responseTime: 0,
    preprocessTime: 0,
    mainprocessTime: 0,
    postprocessTime: 0
}

export const useClient = (props: UseClientProps): ClientState => {

    const [initialized, setInitialized] = useState<boolean>(false)
    // (1-1) クライアント    
    const voiceChangerClientRef = useRef<VoiceChangerClient | null>(null)
    const [voiceChangerClient, setVoiceChangerClient] = useState<VoiceChangerClient | null>(voiceChangerClientRef.current)
    //// クライアント初期化待ち用フラグ
    const initializedResolveRef = useRef<(value: void | PromiseLike<void>) => void>()
    const initializedPromise = useMemo(() => {
        return new Promise<void>((resolve) => {
            initializedResolveRef.current = resolve
        })
    }, [])


    // (1-2) 各種設定I/F
    const clientSetting = useClientSetting({ voiceChangerClient, audioContext: props.audioContext })
    const workletNodeSetting = useWorkletNodeSetting({ voiceChangerClient })
    const workletSetting = useWorkletSetting({ voiceChangerClient })
    const serverSetting = useServerSetting({ voiceChangerClient })

    // (1-3) モニタリングデータ
    const [bufferingTime, setBufferingTime] = useState<number>(0)
    const [performance, setPerformance] = useState<PerformanceData>(InitialPerformanceData)
    const [volume, setVolume] = useState<number>(0)

    // (1-4) エラーステータス
    const errorCountRef = useRef<number>(0)

    // (2-1) 初期化処理
    useEffect(() => {
        const initialized = async () => {
            if (!props.audioContext) {
                return
            }
            const voiceChangerClient = new VoiceChangerClient(props.audioContext, true, {
                notifySendBufferingTime: (val: number) => {
                    setBufferingTime(val)
                },
                notifyResponseTime: (val: number, perf?: number[]) => {
                    const responseTime = val
                    const preprocessTime = perf ? Math.ceil(perf[0] * 1000) : 0
                    const mainprocessTime = perf ? Math.ceil(perf[1] * 1000) : 0
                    const postprocessTime = perf ? Math.ceil(perf[2] * 1000) : 0
                    setPerformance({ responseTime, preprocessTime, mainprocessTime, postprocessTime })
                },
                notifyException: (mes: string) => {
                    if (mes.length > 0) {
                        console.log(`error:${mes}`)
                        errorCountRef.current += 1
                        if (errorCountRef.current > 100) {
                            alert("エラーが頻発しています。対象としているフレームワークのモデルがロードされているか確認してください。")
                            errorCountRef.current = 0
                        }
                    }
                },
                notifyVolume: (vol: number) => {
                    setVolume(vol)
                }
            })

            await voiceChangerClient.isInitialized()
            voiceChangerClientRef.current = voiceChangerClient
            setVoiceChangerClient(voiceChangerClientRef.current)
            console.log("[useClient] client initialized")

            const audio = document.getElementById(props.audioOutputElementId) as HTMLAudioElement
            audio.srcObject = voiceChangerClientRef.current.stream
            audio.play()
            initializedResolveRef.current!()
            setInitialized(true)
        }
        initialized()
    }, [props.audioContext])


    // (2-2) 情報リロード
    const getInfo = useMemo(() => {
        return async () => {
            await initializedPromise
            await clientSetting.reloadClientSetting() // 実質的な処理の意味はない
            await serverSetting.reloadServerInfo()
        }
    }, [clientSetting, serverSetting])


    const clearSetting = async () => {
        await clientSetting.clearSetting()
        await workletNodeSetting.clearSetting()
        await workletSetting.clearSetting()
        await serverSetting.clearSetting()
    }

    return {
        initialized,
        // 各種設定I/Fへの参照
        clientSetting,
        workletNodeSetting,
        workletSetting,
        serverSetting,

        // モニタリングデータ
        bufferingTime,
        volume,
        performance,

        // 情報取得
        getInfo,

        // 設定クリア
        clearSetting,
    }
}