// Copyright (C) 2024 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { PayloadAction, createSlice } from "@reduxjs/toolkit";
import { RootState, store } from "../store";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { Message, MessageRole, ConversationReducer, ConversationRequest } from "./Conversation";
import { getCurrentTimeStamp, uuidv4 } from "../../common/util";
import { createAsyncThunkWrapper } from "../thunkUtil";
import client from "../../common/client";
import { notifications } from "@mantine/notifications";
import {
  CHAT_QNA_URL, 
  DATA_PREP_URL,
  DATA_PREP_GET_URL,
  DATA_PREP_DELETE_URL,
} from "../../config";

const initialState: ConversationReducer = {
  conversations: [],
  selectedConversationId: "",
  onGoingResult: "",
  filesInDataSource: [],
};

export const ConversationSlice = createSlice({
  name: "Conversation",
  initialState,
  reducers: {
    logout: (state) => {
      state.conversations = [];
      state.selectedConversationId = "";
      state.onGoingResult = "";
      state.filesInDataSource = [];
    },
    setOnGoingResult: (state, action: PayloadAction<string>) => {
      state.onGoingResult = action.payload;
    },
    addMessageToMessages: (state, action: PayloadAction<Message>) => {
      const selectedConversation = state.conversations.find((x) => x.conversationId === state.selectedConversationId);
      selectedConversation?.Messages?.push(action.payload);
    },
    newConversation: (state) => {
      (state.selectedConversationId = ""), (state.onGoingResult = "");
    },
    createNewConversation: (state, action: PayloadAction<{ title: string; id: string; message: Message }>) => {
      state.conversations.push({
        title: action.payload.title,
        conversationId: action.payload.id,
        Messages: [action.payload.message],
      });
    },
    setSelectedConversationId: (state, action: PayloadAction<string>) => {
      state.selectedConversationId = action.payload;
    },
  },
  extraReducers(builder) {
    builder.addCase(uploadFile.fulfilled, () => {
      notifications.update({
        id: "upload-file",
        message: "File Uploaded Successfully",
        loading: false,
        autoClose: 3000,
      });
    }),
      builder.addCase(uploadFile.rejected, () => {
        notifications.update({
          color: "red",
          id: "upload-file",
          message: "Failed to Upload file",
          loading: false,
        });
      });
    builder.addCase(submitDataSourceURL.fulfilled, () => {
      notifications.show({
        message: "Submitted Successfully",
      });
    });
    builder.addCase(submitDataSourceURL.rejected, () => {
      notifications.show({
        color: "red",
        message: "Submit Failed",
      });
    });
    builder.addCase(getAllFilesInDataSource.fulfilled, (state, action) => {
      state.filesInDataSource = action.payload;
    });
  },
});

export const submitDataSourceURL = createAsyncThunkWrapper(
  "conversation/submitDataSourceURL",
  async ({ link_list }: { link_list: string[] }, { dispatch }) => {
    const body = new FormData();
    body.append("link_list", JSON.stringify(link_list));
    const response = await client.post(DATA_PREP_URL, body);
    dispatch(getAllFilesInDataSource({ knowledgeBaseId: "default" }));
    return response.data;
  },
);
export const getAllFilesInDataSource = createAsyncThunkWrapper(
  "conversation/getAllFilesInDataSource",
  async ({ knowledgeBaseId }: { knowledgeBaseId: string }, {}) => {
    const body = {
      knowledge_base_id: knowledgeBaseId,
    };
    const response = await client.post(DATA_PREP_GET_URL, body);
    return response.data;
  },
);
export const deleteInDataSource = createAsyncThunkWrapper(
  "conversation/deleteInDataSource",
  async ({ file }: { file: any }, { dispatch }) => {
    const response = await client.post(DATA_PREP_DELETE_URL, {
      file_path: file,
    });
    dispatch(getAllFilesInDataSource({ knowledgeBaseId: "default" }));
    return response.data;
  },
);
export const uploadFile = createAsyncThunkWrapper(
  "conversation/uploadFile",
  async ({ file }: { file: File }, { dispatch }) => {
    const body = new FormData();
    body.append("files", file);

    notifications.show({
      id: "upload-file",
      message: "uploading File",
      loading: true,
    });
    const response = await client.post(DATA_PREP_URL, body);
    dispatch(getAllFilesInDataSource({ knowledgeBaseId: "default" }));
    return response.data;
  },
);
export const {
  logout,
  setOnGoingResult,
  newConversation,
  addMessageToMessages,
  setSelectedConversationId,
  createNewConversation,
} = ConversationSlice.actions;
export const conversationSelector = (state: RootState) => state.conversationReducer;
export default ConversationSlice.reducer;

export const doConversation = (conversationRequest: ConversationRequest) => {
  const { conversationId, userPrompt, messages, model } = conversationRequest;
  if (!conversationId) {
    //newConversation
    const id = uuidv4();
    store.dispatch(
      createNewConversation({
        title: userPrompt.content,
        id,
        message: userPrompt,
      }),
    );
    store.dispatch(setSelectedConversationId(id));
  } else {
    store.dispatch(addMessageToMessages(userPrompt));
  }
  const userPromptWithoutTime = {
    role: userPrompt.role,
    content: userPrompt.content,
  };
  const body = {
    messages: [...messages, userPromptWithoutTime],
    model,
  };

  //   let conversation: Conversation;
  let result = "";
  let ansFlag: boolean = true;
  let assFlag: boolean = false;
  let attempt = 1;
  try {
    fetchEventSource(CHAT_QNA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      openWhenHidden: true,
      async onopen(response) {
        if (response.ok) {
          return;
        } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          const e = await response.json();
          console.log(e);
          throw Error(e.error.message);
        } else {
          console.log("error", response);
        }
      },
      onmessage(msg) {
        if (msg?.data == "assistant" || msg?.data == "Assistant") {
          assFlag = true;
          ansFlag = true;
        }
        if (msg?.data == "user" || msg?.data == "User" || msg?.data == "###") {
          ansFlag = false;
          if (assFlag == true) {
            attempt -= 1
          }
        }
        if (msg?.data != "[DONE]" && msg?.data != "<|endoftext|>" && ansFlag && attempt > 0) {
          try {
            /*const match = msg.data.match(/b'([^']*)'/);
              if (match && match[1] != "</s>") {
              const extractedText = match[1];
              result += extractedText;
              store.dispatch(setOnGoingResult(result));
            }
            */
            if (msg?.data != ":" && msg?.data != "assistant" && msg?.data != "Assistant") {
              result += msg.data;
              store.dispatch(setOnGoingResult(result));
            }
          } catch (e) {
            console.log("something wrong in msg", e);
            throw e;
          }
        }
      },
      onerror(err) {
        console.log("error", err);
        store.dispatch(setOnGoingResult(""));
        //notify here
        throw err;
        //handle error
      },
      onclose() {
        //handle close
        store.dispatch(setOnGoingResult(""));

        store.dispatch(
          addMessageToMessages({
            role: MessageRole.Assistant,
            content: result,
            time: getCurrentTimeStamp(),
          }),
        );
      },
    });
  } catch (err) {
    console.log(err);
  }
};
